package ruleengine

import "time"

// AnomalyEvent, bir kural ihlali tespit edildiğinde üretilen yapılandırılmış olay kaydıdır.
type AnomalyEvent struct {
	Timestamp        time.Time `json:"timestamp"`
	EventType        string    `json:"event_type"`       // sabit: "anomaly"
	Mode             string    `json:"mode"`             // "dry-run" | "remediation"
	ContainerID      string    `json:"container_id"`
	ContainerName    string    `json:"container_name"`
	RuleName         string    `json:"rule_name"`
	MetricType       string    `json:"metric_type"`
	CurrentValue     float64   `json:"current_value"`
	Threshold        float64   `json:"threshold"`
	ConsecutiveCount int       `json:"consecutive_count"`
	Action           string    `json:"action"`
	DryRun           bool      `json:"dry_run"`
}

// NewAnomalyEvent, verilen parametrelerden bir AnomalyEvent oluşturur.
// EventType alanını "anomaly" sabitiyle, Timestamp'i time.Now().UTC() ile,
// Mode alanını dryRun değerine göre "dry-run" veya "remediation" olarak ayarlar.
func NewAnomalyEvent(
	containerID, containerName, ruleName, metricType string,
	currentValue, threshold float64,
	consecutiveCount int,
	action string,
	dryRun bool,
) AnomalyEvent {
	mode := "remediation"
	if dryRun {
		mode = "dry-run"
	}

	return AnomalyEvent{
		Timestamp:        time.Now().UTC(),
		EventType:        "anomaly",
		Mode:             mode,
		ContainerID:      containerID,
		ContainerName:    containerName,
		RuleName:         ruleName,
		MetricType:       metricType,
		CurrentValue:     currentValue,
		Threshold:        threshold,
		ConsecutiveCount: consecutiveCount,
		Action:           action,
		DryRun:           dryRun,
	}
}
