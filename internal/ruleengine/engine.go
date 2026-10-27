package ruleengine

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"sync"

	"zeropulse-agent/internal/collector"
	"zeropulse-agent/internal/config"
)

// RuleEngine evaluates metrics snapshots against configured rules in memory,
// tracking state and cooldowns to emit AnomalyEvents when breaches occur.
type RuleEngine struct {
	mu        sync.RWMutex
	rules     []config.Rule
	state     *StateTracker
	cooldown  *CooldownTracker
	dryRun    bool
	out       io.Writer
	logger    *slog.Logger
	onAnomaly func(evt AnomalyEvent)
	hostname  func() (string, error) // for testability; defaults to os.Hostname
	evalHook  func(rule config.Rule, c collector.ContainerMetrics) // for testability
}

// NewRuleEngine constructs a new RuleEngine instance.
// It initializes in-memory StateTracker and CooldownTracker, and logs
// its operating mode (dry-run vs remediation) to the provided logger (stderr).
func NewRuleEngine(rules []config.Rule, dryRun bool, out io.Writer, logger *slog.Logger) *RuleEngine {
	mode := "remediation"
	if dryRun {
		mode = "dry-run"
	}

	if logger != nil {
		logger.Info("rule engine initialized",
			slog.String("mode", mode),
			slog.Bool("dry_run", dryRun),
			slog.Int("rule_count", len(rules)),
		)
	}

	if out == nil {
		out = os.Stdout
	}

	return &RuleEngine{
		rules:    rules,
		state:    NewStateTracker(),
		cooldown: NewCooldownTracker(),
		dryRun:   dryRun,
		out:      out,
		logger:   logger,
		hostname: os.Hostname,
	}
}

// EvaluateDocker evaluates all configured rules against each container in the DockerMetricsSnapshot.
// Each rule evaluation is protected against panic using recover().
// Stale state and cooldown entries for containers no longer present are purged at the end.
func (e *RuleEngine) EvaluateDocker(snap *collector.DockerMetricsSnapshot) {
	if snap == nil {
		return
	}

	e.mu.RLock()
	rules := make([]config.Rule, len(e.rules))
	copy(rules, e.rules)
	dryRun := e.dryRun
	e.mu.RUnlock()

	activeContainerIDs := make(map[string]struct{}, len(snap.Containers))
	for _, c := range snap.Containers {
		activeContainerIDs[c.ContainerID] = struct{}{}
	}

	for _, c := range snap.Containers {
		for _, rule := range rules {
			func() {
				defer func() {
					if r := recover(); r != nil {
						if e.logger != nil {
							e.logger.Error("rule evaluation panicked",
								slog.String("rule", rule.Name),
								slog.String("container_id", c.ContainerID),
								slog.Any("panic", r),
							)
						}
					}
				}()

				if e.evalHook != nil {
					e.evalHook(rule, c)
				}

				// Check container filter
				if rule.ContainerFilter != "" && rule.ContainerFilter != c.Name {
					return
				}

				val, err := ExtractDockerMetricValue(c, rule.MetricType)
				if err != nil {
					if e.logger != nil {
						e.logger.Warn("failed to extract docker metric value",
							slog.String("rule", rule.Name),
							slog.String("metric_type", string(rule.MetricType)),
							slog.String("error", err.Error()),
						)
					}
					return
				}

				breach := isThresholdBreached(val, rule.Operator, rule.Threshold)
				count := e.state.Record(rule.Name, c.ContainerID, breach)

				if breach && count >= rule.ConsecutivePeriods {
					if e.cooldown.IsAllowed(rule.Name, c.ContainerID, rule.CooldownSeconds) {
						e.cooldown.Record(rule.Name, c.ContainerID)
						evt := NewAnomalyEvent(
							c.ContainerID,
							c.Name,
							rule.Name,
							string(rule.MetricType),
							val,
							rule.Threshold,
							count,
							string(rule.Action),
							dryRun,
						)
						e.emitEvent(evt)
					}
				}
			}()
		}
	}

	e.state.Purge(activeContainerIDs)
	e.cooldown.Purge(activeContainerIDs)
}

// EvaluateStandalone evaluates configured rules against a host StandaloneSnapshot.
// The container ID is set to "host" and container name to the host's hostname.
func (e *RuleEngine) EvaluateStandalone(snap *collector.StandaloneSnapshot) {
	if snap == nil {
		return
	}

	e.mu.RLock()
	rules := make([]config.Rule, len(e.rules))
	copy(rules, e.rules)
	dryRun := e.dryRun
	e.mu.RUnlock()

	const hostContainerID = "host"
	hostname := "unknown"
	if e.hostname != nil {
		if h, err := e.hostname(); err == nil && h != "" {
			hostname = h
		}
	}

	activeContainerIDs := map[string]struct{}{
		hostContainerID: {},
	}

	for _, rule := range rules {
		func() {
			defer func() {
				if r := recover(); r != nil {
					if e.logger != nil {
						e.logger.Error("rule evaluation panicked",
							slog.String("rule", rule.Name),
							slog.String("container_id", hostContainerID),
							slog.Any("panic", r),
						)
					}
				}
			}()

			// Check container filter: match hostname or "host"
			if rule.ContainerFilter != "" && rule.ContainerFilter != hostname && rule.ContainerFilter != hostContainerID {
				return
			}

			val, err := ExtractStandaloneMetricValue(snap, rule.MetricType)
			if err != nil {
				if e.logger != nil {
					e.logger.Warn("failed to extract standalone metric value",
						slog.String("rule", rule.Name),
						slog.String("metric_type", string(rule.MetricType)),
						slog.String("error", err.Error()),
					)
				}
				return
			}

			breach := isThresholdBreached(val, rule.Operator, rule.Threshold)
			count := e.state.Record(rule.Name, hostContainerID, breach)

			if breach && count >= rule.ConsecutivePeriods {
				if e.cooldown.IsAllowed(rule.Name, hostContainerID, rule.CooldownSeconds) {
					e.cooldown.Record(rule.Name, hostContainerID)
					evt := NewAnomalyEvent(
						hostContainerID,
						hostname,
						rule.Name,
						string(rule.MetricType),
						val,
						rule.Threshold,
						count,
						string(rule.Action),
						dryRun,
					)
					e.emitEvent(evt)
				}
			}
		}()
	}

	e.state.Purge(activeContainerIDs)
	e.cooldown.Purge(activeContainerIDs)
}

func isThresholdBreached(value float64, op config.Operator, threshold float64) bool {
	switch op {
	case config.OperatorGT:
		return value > threshold
	case config.OperatorGTE:
		return value >= threshold
	default:
		return false
	}
}

func (e *RuleEngine) emitEvent(evt AnomalyEvent) {
	data, err := json.Marshal(evt)
	if err != nil {
		if e.logger != nil {
			e.logger.Error("failed to marshal anomaly event", slog.String("error", err.Error()))
		}
		return
	}
	if e.out != nil {
		_, _ = e.out.Write(append(data, '\n'))
	}

	e.mu.RLock()
	handler := e.onAnomaly
	e.mu.RUnlock()

	if handler != nil {
		handler(evt)
	}
}

// Rules returns a thread-safe copy of currently configured rules.
func (e *RuleEngine) Rules() []config.Rule {
	e.mu.RLock()
	defer e.mu.RUnlock()
	res := make([]config.Rule, len(e.rules))
	copy(res, e.rules)
	return res
}

// AddRule validates and registers a new rule into the engine in a thread-safe manner.
func (e *RuleEngine) AddRule(rule config.Rule) error {
	if err := rule.Validate(); err != nil {
		return err
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	for _, r := range e.rules {
		if r.Name == rule.Name {
			return fmt.Errorf("rule with name %q already exists", rule.Name)
		}
	}

	e.rules = append(e.rules, rule)
	if e.logger != nil {
		e.logger.Info("rule added to engine", slog.String("name", rule.Name))
	}
	return nil
}

// DeleteRule removes a rule by name from the engine. Returns true if the rule was found and deleted.
func (e *RuleEngine) DeleteRule(name string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()

	found := false
	filtered := make([]config.Rule, 0, len(e.rules))
	for _, r := range e.rules {
		if r.Name == name {
			found = true
			continue
		}
		filtered = append(filtered, r)
	}

	if found {
		e.rules = filtered
		if e.logger != nil {
			e.logger.Info("rule deleted from engine", slog.String("name", name))
		}
	}
	return found
}

// SetRules updates the entire rule set atomically after validation.
func (e *RuleEngine) SetRules(rules []config.Rule) error {
	for i, r := range rules {
		if err := r.Validate(); err != nil {
			return fmt.Errorf("invalid rule at index %d (%q): %w", i, r.Name, err)
		}
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	e.rules = make([]config.Rule, len(rules))
	copy(e.rules, rules)
	return nil
}

// SetDryRun dynamically switches between dry-run and active remediation.
func (e *RuleEngine) SetDryRun(dryRun bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.dryRun = dryRun
}

// IsDryRun returns the current operational mode of the engine.
func (e *RuleEngine) IsDryRun() bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.dryRun
}

// SetAnomalyHandler registers a callback invoked whenever an AnomalyEvent is emitted.
func (e *RuleEngine) SetAnomalyHandler(handler func(evt AnomalyEvent)) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.onAnomaly = handler
}

// GetBreachedContainers returns a map of container IDs currently breaching rules and their severity ("critical" or "warning").
func (e *RuleEngine) GetBreachedContainers() map[string]string {
	e.mu.RLock()
	defer e.mu.RUnlock()

	res := make(map[string]string)
	for _, rule := range e.rules {
		for key, count := range e.state.counts {
			if key.RuleName == rule.Name && count >= rule.ConsecutivePeriods {
				if rule.Action == config.ActionRestart {
					res[key.ContainerID] = "critical"
				} else if res[key.ContainerID] != "critical" {
					res[key.ContainerID] = "warning"
				}
			}
		}
	}
	return res
}

