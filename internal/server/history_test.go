package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"zeropulse-agent/internal/collector"
)

func netFrame(at time.Time, containers ...ContainerCard) MetricsEventPayload {
	return MetricsEventPayload{Timestamp: at, Containers: containers}
}

func TestMetricsHistoryWrapsOldestFirst(t *testing.T) {
	h := NewMetricsHistory(3)
	base := time.Unix(1_700_000_000, 0).UTC()

	if got := h.Snapshot(); len(got) != 0 {
		t.Fatalf("expected empty snapshot, got %d samples", len(got))
	}
	for i := 0; i < 5; i++ {
		h.Record(netFrame(base.Add(time.Duration(i) * 5 * time.Second)))
	}

	got := h.Snapshot()
	if len(got) != 3 {
		t.Fatalf("expected capacity-bound 3 samples, got %d", len(got))
	}
	for i, wantStep := range []int{2, 3, 4} {
		want := base.Add(time.Duration(wantStep) * 5 * time.Second)
		if !got[i].Timestamp.Equal(want) {
			t.Errorf("sample %d: expected %v, got %v", i, want, got[i].Timestamp)
		}
	}
}

func TestMetricsHistoryNetworkRates(t *testing.T) {
	h := NewMetricsHistory(10)
	base := time.Unix(1_700_000_000, 0).UTC()
	step := func(n int) time.Time { return base.Add(time.Duration(n) * 5 * time.Second) }

	first := h.Record(netFrame(step(0), ContainerCard{ID: "a", NetRxBytes: 1000, NetTxBytes: 500}))
	if first.NetRxBytesPerSec != nil || first.NetTxBytesPerSec != nil {
		t.Fatal("first frame has nothing to compare with; rates must be null")
	}

	second := h.Record(netFrame(step(1), ContainerCard{ID: "a", NetRxBytes: 6000, NetTxBytes: 1500}))
	if *second.NetRxBytesPerSec != 1000 || *second.NetTxBytesPerSec != 200 {
		t.Errorf("expected 1000/200 B/s, got %v/%v", *second.NetRxBytesPerSec, *second.NetTxBytesPerSec)
	}

	// A new container's lifetime total and a restarted container's counter reset are not traffic.
	third := h.Record(netFrame(step(2),
		ContainerCard{ID: "a", NetRxBytes: 10, NetTxBytes: 10},
		ContainerCard{ID: "b", NetRxBytes: 9_000_000, NetTxBytes: 9_000_000},
	))
	if *third.NetRxBytesPerSec != 0 || *third.NetTxBytesPerSec != 0 {
		t.Errorf("expected no spike, got %v/%v", *third.NetRxBytesPerSec, *third.NetTxBytesPerSec)
	}

	// The clock moving backwards must not produce negative or infinite rates.
	skewed := h.Record(netFrame(step(1), ContainerCard{ID: "a", NetRxBytes: 20, NetTxBytes: 20}))
	if skewed.NetRxBytesPerSec != nil {
		t.Errorf("expected null rate after clock skew, got %v", *skewed.NetRxBytesPerSec)
	}
}

func TestMetricsHistoryPercentages(t *testing.T) {
	h := NewMetricsHistory(2)
	sample := h.Record(MetricsEventPayload{System: SystemOverview{
		SystemCPUPercent:    140,
		SystemMemUsedBytes:  512,
		SystemMemTotalBytes: 2048,
	}})
	if sample.CPUPercent != 100 || sample.MemPercent != 25 {
		t.Errorf("expected 100/25, got %v/%v", sample.CPUPercent, sample.MemPercent)
	}

	// A host that reports no memory total must not divide by zero.
	if s := h.Record(MetricsEventPayload{}); s.MemPercent != 0 {
		t.Errorf("expected 0 memory percent, got %v", s.MemPercent)
	}
}

func TestMetricsHistoryEndpoint(t *testing.T) {
	srv := NewServer(ServerConfig{Addr: "127.0.0.1:0"}, collector.EnvDocker, newTestLogger())
	at := time.Now().UTC()
	srv.PushMetrics(MetricsEventPayload{
		Timestamp: at,
		System:    SystemOverview{SystemCPUPercent: 12.5, SystemMemUsedBytes: 1, SystemMemTotalBytes: 2},
	})

	if srv.latestPayload.Sample == nil || srv.latestPayload.Sample.CPUPercent != 12.5 {
		t.Fatalf("SSE payload must carry the sample stored in history: %+v", srv.latestPayload.Sample)
	}

	rec := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/metrics/history", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}
	var res struct {
		Samples []MetricsSample `json:"samples"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&res); err != nil {
		t.Fatalf("failed to decode history: %v", err)
	}
	if len(res.Samples) != 1 || res.Samples[0].CPUPercent != 12.5 || res.Samples[0].MemPercent != 50 {
		t.Errorf("unexpected samples: %+v", res.Samples)
	}

	rec = httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/v1/metrics/history", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405 for POST, got %d", rec.Code)
	}
}

func TestMetricsHistoryRequiresAuth(t *testing.T) {
	cfg := ServerConfig{Addr: "127.0.0.1:0", AuthEnabled: true, AuthUser: "admin", AuthPass: "secret"}
	srv := NewServer(cfg, collector.EnvDocker, newTestLogger())

	rec := httptest.NewRecorder()
	srv.httpServer.Handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/metrics/history", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 without credentials, got %d", rec.Code)
	}
}
