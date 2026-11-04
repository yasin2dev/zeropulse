package config

import (
	"fmt"
	"strings"
)

// MetricType represents the type of metric a rule monitors.
type MetricType string

const (
	MetricCPUPercent          MetricType = "CPU_PERCENT"
	MetricMemPercent          MetricType = "MEM_PERCENT"
	MetricCPUThrottledPeriods MetricType = "CPU_THROTTLED_PERIODS"
	MetricNetRxBytes          MetricType = "NET_RX_BYTES"
	MetricNetTxBytes          MetricType = "NET_TX_BYTES"
)

// Operator represents the comparison operator used in rule evaluation.
type Operator string

const (
	OperatorGT  Operator = "GT"
	OperatorGTE Operator = "GTE"
)

// Action represents the action to take when a rule fires.
type Action string

const (
	ActionRestart Action = "RESTART"
	ActionNotify  Action = "NOTIFY"
	ActionScale   Action = "SCALE"
)

// Rule defines a monitoring rule that the rule engine evaluates against
// incoming metric snapshots.
type Rule struct {
	Name               string     `yaml:"name"                json:"name"`
	MetricType         MetricType `yaml:"metric_type"         json:"metric_type"`
	Operator           Operator   `yaml:"operator"            json:"operator"`
	Threshold          float64    `yaml:"threshold"           json:"threshold"`
	ConsecutivePeriods int        `yaml:"consecutive_periods" json:"consecutive_periods"`
	Action             Action     `yaml:"action"              json:"action"`
	CooldownSeconds    int        `yaml:"cooldown_seconds"    json:"cooldown_seconds"`
	ContainerFilter    string     `yaml:"container_filter"    json:"container_filter"`
}

// validMetricTypes is the set of accepted MetricType values.
var validMetricTypes = map[MetricType]struct{}{
	MetricCPUPercent:          {},
	MetricMemPercent:          {},
	MetricCPUThrottledPeriods: {},
	MetricNetRxBytes:          {},
	MetricNetTxBytes:          {},
}

// validOperators is the set of accepted Operator values.
var validOperators = map[Operator]struct{}{
	OperatorGT:  {},
	OperatorGTE: {},
}

// validActions is the set of accepted Action values.
var validActions = map[Action]struct{}{
	ActionRestart: {},
	ActionNotify:  {},
	ActionScale:   {},
}

// Validate checks all fields of the Rule for correctness.
// It returns a descriptive error for the first violation found.
func (r Rule) Validate() error {
	if strings.TrimSpace(r.Name) == "" {
		return fmt.Errorf("rule name must not be empty or whitespace")
	}

	if _, ok := validMetricTypes[r.MetricType]; !ok {
		return fmt.Errorf("rule %q: unknown metric_type %q; must be one of CPU_PERCENT, MEM_PERCENT, CPU_THROTTLED_PERIODS, NET_RX_BYTES, NET_TX_BYTES", r.Name, r.MetricType)
	}

	if _, ok := validOperators[r.Operator]; !ok {
		return fmt.Errorf("rule %q: unknown operator %q; must be one of GT, GTE", r.Name, r.Operator)
	}

	if _, ok := validActions[r.Action]; !ok {
		return fmt.Errorf("rule %q: unknown action %q; must be one of RESTART, NOTIFY, SCALE", r.Name, r.Action)
	}

	if r.Action == ActionRestart && strings.TrimSpace(r.ContainerFilter) == "" {
		return fmt.Errorf("rule %q: RESTART requires container_filter so only a named container is restarted", r.Name)
	}

	if r.Threshold < 0 {
		return fmt.Errorf("rule %q: threshold must be >= 0, got %g", r.Name, r.Threshold)
	}

	if r.ConsecutivePeriods < 1 {
		return fmt.Errorf("rule %q: consecutive_periods must be >= 1, got %d", r.Name, r.ConsecutivePeriods)
	}

	if r.CooldownSeconds < 0 {
		return fmt.Errorf("rule %q: cooldown_seconds must be >= 0, got %d", r.Name, r.CooldownSeconds)
	}

	return nil
}
