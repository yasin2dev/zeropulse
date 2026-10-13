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
