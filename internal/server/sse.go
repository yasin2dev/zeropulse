package server

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

const maxSSEClients = 15

// SSEMessage represents an individual event payload pushed to subscribers.
type SSEMessage struct {
	Event string
	ID    string
	Data  []byte
}

// SSEHub manages active client connections and broadcasts real-time events.
type SSEHub struct {
	mu      sync.Mutex
	clients map[chan SSEMessage]struct{}
	logger  *slog.Logger
}

// NewSSEHub creates a new SSEHub.
func NewSSEHub(logger *slog.Logger) *SSEHub {
	return &SSEHub{
		clients: make(map[chan SSEMessage]struct{}),
		logger:  logger,
	}
}

// Register adds a new client channel. If the capacity limit is exceeded, returns false.
func (h *SSEHub) Register(ch chan SSEMessage) bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	if len(h.clients) >= maxSSEClients {
		if h.logger != nil {
			h.logger.Warn("sse client limit reached, refusing connection", "max", maxSSEClients)
		}
		return false
	}
	h.clients[ch] = struct{}{}
	return true
}

// Unregister removes a client channel.
func (h *SSEHub) Unregister(ch chan SSEMessage) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[ch]; ok {
		delete(h.clients, ch)
		close(ch)
	}
}

// Broadcast sends a message to all connected clients.
func (h *SSEHub) Broadcast(event string, id string, data []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()

	msg := SSEMessage{
		Event: event,
		ID:    id,
		Data:  data,
	}

	for ch := range h.clients {
		select {
		case ch <- msg:
		default:
			// Client buffer full or slow, skip to prevent blocking
		}
	}
}

// ClientCount returns the number of currently active SSE subscriptions.
func (h *SSEHub) ClientCount() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.clients)
}

// ServeHTTP handles the SSE connection upgrade and streaming loop.
func (h *SSEHub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	// Disable buffering for Nginx and HTTP proxies
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	clientChan := make(chan SSEMessage, 32)
	if !h.Register(clientChan) {
		http.Error(w, "Too many active dashboard connections", http.StatusServiceUnavailable)
		return
	}
	defer h.Unregister(clientChan)

	// Send initial connection handshake
	initPayload, _ := json.Marshal(map[string]interface{}{
		"status":    "connected",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
	_, _ = fmt.Fprintf(w, "event: connected\ndata: %s\n\n", initPayload)
	flusher.Flush()

	heartbeatTicker := time.NewTicker(15 * time.Second)
	defer heartbeatTicker.Stop()

	notify := r.Context().Done()

	for {
		select {
		case <-notify:
			return
		case <-heartbeatTicker.C:
			hbData, _ := json.Marshal(map[string]interface{}{
				"timestamp": time.Now().UTC().Format(time.RFC3339),
				"clients":   h.ClientCount(),
			})
			if _, err := fmt.Fprintf(w, "event: heartbeat\ndata: %s\n\n", hbData); err != nil {
				return
			}
			flusher.Flush()
		case msg, open := <-clientChan:
			if !open {
				return
			}
			if msg.ID != "" {
				_, _ = fmt.Fprintf(w, "id: %s\n", msg.ID)
			}
			if msg.Event != "" {
				_, _ = fmt.Fprintf(w, "event: %s\n", msg.Event)
			}
			if _, err := fmt.Fprintf(w, "data: %s\n\n", msg.Data); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
