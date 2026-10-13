package collector

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"time"
)

// ContainerInfo holds minimal identifying data for a running container.
type ContainerInfo struct {
	ID    string   `json:"id"`
	Names []string `json:"names"`
	Image string   `json:"image"`
	State string   `json:"state"`
}

// DockerSnapshot is the structured payload emitted when the agent runs
// inside (or alongside) a Docker environment.
type DockerSnapshot struct {
	CollectedAt time.Time       `json:"collected_at"`
	Environment Environment     `json:"environment"`
	Containers  []ContainerInfo `json:"containers"`
}

// dockerContainer mirrors the relevant fields from the Docker Engine API
// GET /containers/json response.
type dockerContainer struct {
	ID    string   `json:"Id"`
	Names []string `json:"Names"`
	Image string   `json:"Image"`
	State string   `json:"State"`
}

// newDockerHTTPClient returns an *http.Client that dials over the Docker
// Unix socket instead of TCP. No third-party SDK required.
func newDockerHTTPClient() *http.Client {
	return &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				return (&net.Dialer{}).DialContext(ctx, "unix", dockerSocketPath)
			},
		},
	}
}

// CollectDocker connects to the local Docker daemon via the Unix socket
// and returns a snapshot of all currently running containers.
func CollectDocker() (*DockerSnapshot, error) {
	client := newDockerHTTPClient()

	// The host part is ignored when dialing over Unix socket; "localhost"
	// is a conventional placeholder recognised by the Docker daemon.
	req, err := http.NewRequestWithContext(
		context.Background(),
		http.MethodGet,
		// all=false → only running containers
		"http://localhost/v1.41/containers/json?all=false",
		nil,
	)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("docker api call: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("docker api returned HTTP %d", resp.StatusCode)
	}

	var raw []dockerContainer
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	infos := make([]ContainerInfo, 0, len(raw))
	for _, c := range raw {
		id := c.ID
		if len(id) > 12 {
			id = id[:12] // short ID, same convention as `docker ps`
		}
		infos = append(infos, ContainerInfo{
			ID:    id,
			Names: c.Names,
			Image: c.Image,
			State: c.State,
		})
	}

	return &DockerSnapshot{
		CollectedAt: time.Now().UTC(),
		Environment: EnvDocker,
		Containers:  infos,
	}, nil
}
