package config

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// standaloneUnsupportedMetrics lists MetricTypes that cannot be evaluated
// in standalone (non-Docker) mode because the host snapshot does not
// provide those fields.
var standaloneUnsupportedMetrics = map[MetricType]struct{}{
	MetricCPUThrottledPeriods: {},
	MetricNetRxBytes:          {},
	MetricNetTxBytes:          {},
}

// rawConfig is the top-level structure of both YAML and JSON config files.
// The file must have a "rules" key at the top level.
type rawConfig struct {
	Rules []Rule `yaml:"rules" json:"rules"`
}

// ConfigLoader reads rule configuration files in YAML or JSON format.
type ConfigLoader struct{}

// Load reads a config file from path, parses it into []Rule, validates each
// rule, and returns the slice of valid rules.
//
// Format detection is based on the file extension:
//   - .yaml / .yml → YAML
//   - .json        → JSON
//   - anything else → YAML is attempted
//
// If standalone is true, rules that use metric types unsupported in standalone
// mode (CPU_THROTTLED_PERIODS, NET_RX_BYTES, NET_TX_BYTES) are filtered out
// with a warning log rather than causing an error.
//
// Load returns an error if the file cannot be read or if parsing fails
// (malformed YAML/JSON). Individual rules that fail Validate() are skipped
// with a warning; the remaining valid rules are returned without an error.
func (c ConfigLoader) Load(path string, standalone bool, logger *slog.Logger) ([]Rule, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("config: cannot read file %q: %w", path, err)
	}

	var raw rawConfig

	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".json":
		if err := json.Unmarshal(data, &raw); err != nil {
			return nil, fmt.Errorf("config: failed to parse JSON file %q: %w", path, err)
		}
	default:
		// .yaml, .yml, or unknown extension — attempt YAML
		if err := yaml.Unmarshal(data, &raw); err != nil {
			return nil, fmt.Errorf("config: failed to parse YAML file %q: %w", path, err)
		}
	}

	valid := make([]Rule, 0, len(raw.Rules))

	for i, rule := range raw.Rules {
		// Validate the rule's own fields.
		if err := rule.Validate(); err != nil {
			logger.Warn("config: skipping invalid rule",
				slog.Int("index", i),
				slog.String("name", rule.Name),
				slog.String("error", err.Error()),
			)
			continue
		}

		// In standalone mode, filter out metrics that the host snapshot cannot supply.
		if standalone {
			if _, unsupported := standaloneUnsupportedMetrics[rule.MetricType]; unsupported {
				logger.Warn("config: skipping rule with metric type unsupported in standalone mode",
					slog.String("name", rule.Name),
					slog.String("metric_type", string(rule.MetricType)),
				)
				continue
			}
		}

		valid = append(valid, rule)
	}

	if len(valid) == 0 {
		logger.Warn("config: no valid rules loaded; rule engine will not evaluate any rules",
			slog.String("path", path),
		)
	}

	return valid, nil
}

// DefaultConfigPaths returns the standard fallback locations checked for rule files.
func DefaultConfigPaths() []string {
	return []string{
		"/etc/zeropulse/rules.yaml",
		"/etc/zeropulse/rules.json",
		"./rules.yaml",
		"./rules.json",
	}
}

// ResolveConfigPath determines which configuration file path to use.
// Evaluation order:
//  1. cliPath if not empty (explicit user flag)
//  2. envPath if not empty (explicit environment variable)
//  3. First existing file from defaultPaths (or DefaultConfigPaths() if not supplied)
//
// Returns empty string if no candidate file exists.
func ResolveConfigPath(cliPath, envPath string, defaultPaths ...string) string {
	if strings.TrimSpace(cliPath) != "" {
		return strings.TrimSpace(cliPath)
	}
	if strings.TrimSpace(envPath) != "" {
		return strings.TrimSpace(envPath)
	}

	candidates := defaultPaths
	if len(candidates) == 0 {
		candidates = DefaultConfigPaths()
	}

	for _, p := range candidates {
		if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
			return p
		}
	}

	return ""
}

// Save validates the rules and serializes them to the specified path in YAML or JSON.
// Format is determined by file extension (.json -> JSON, else YAML).
// The write is atomic: written to a temporary file in the same directory and renamed.
func (c ConfigLoader) Save(path string, rules []Rule) error {
	for i, r := range rules {
		if err := r.Validate(); err != nil {
			return fmt.Errorf("config: invalid rule at index %d (%q): %w", i, r.Name, err)
		}
	}

	raw := rawConfig{Rules: rules}
	var data []byte
	var err error

	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".json":
		data, err = json.MarshalIndent(raw, "", "  ")
		if err != nil {
			return fmt.Errorf("config: failed to marshal JSON: %w", err)
		}
		data = append(data, '\n')
	default:
		data, err = yaml.Marshal(raw)
		if err != nil {
			return fmt.Errorf("config: failed to marshal YAML: %w", err)
		}
	}

	dir := filepath.Dir(path)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("config: failed to create directory %q: %w", dir, err)
		}
	}

	tmpFile, err := os.CreateTemp(dir, "zeropulse-rules-*.tmp")
	if err != nil {
		return fmt.Errorf("config: failed to create temporary file: %w", err)
	}
	tmpName := tmpFile.Name()
	defer func() {
		_ = os.Remove(tmpName)
	}()

	if _, err := tmpFile.Write(data); err != nil {
		_ = tmpFile.Close()
		return fmt.Errorf("config: failed to write to temporary file: %w", err)
	}
	if err := tmpFile.Sync(); err != nil {
		_ = tmpFile.Close()
		return fmt.Errorf("config: failed to sync temporary file: %w", err)
	}
	if err := tmpFile.Close(); err != nil {
		return fmt.Errorf("config: failed to close temporary file: %w", err)
	}

	if err := os.Rename(tmpName, path); err != nil {
		return fmt.Errorf("config: failed to rename temporary file to %q: %w", path, err)
	}

	return nil
}

