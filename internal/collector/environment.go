// Package collector provides environment detection and metrics collection
// for the Zeropulse agent. It auto-detects whether it is running inside a
// Docker environment or on a standalone Linux/FreeBSD host.
package collector

import "os"

const dockerSocketPath = "/var/run/docker.sock"

// Environment represents the runtime environment type.
type Environment string

const (
	EnvDocker     Environment = "docker"
	EnvStandalone Environment = "standalone"
)

// DetectEnvironment checks for the Docker socket and returns the
// appropriate Environment constant.
func DetectEnvironment() Environment {
	_, err := os.Stat(dockerSocketPath)
	if err == nil {
		return EnvDocker
	}
	return EnvStandalone
}
