package ruleengine

import "time"

// CooldownTracker tracks the last fired time for each (RuleName, ContainerID)
// pair to prevent flapping — repeated firing within a short window
// (Requirements 4.1, 4.2, 4.3, 4.4, 4.5).
type CooldownTracker struct {
	lastFired map[stateKey]time.Time
	now       func() time.Time // injectable for testing
}

// NewCooldownTracker creates a new CooldownTracker using real wall-clock time.
func NewCooldownTracker() *CooldownTracker {
	return &CooldownTracker{
		lastFired: make(map[stateKey]time.Time),
		now:       time.Now,
	}
}

// IsAllowed reports whether an action is permitted for the given
// (ruleName, containerID) pair.
//
//   - If cooldownSecs == 0, the action is always allowed (Requirement 4.4).
//   - If cooldownSecs > 0, the action is allowed only when at least
//     cooldownSecs seconds have elapsed since the last recorded firing
//     (Requirement 4.2, 4.3).
func (c *CooldownTracker) IsAllowed(ruleName, containerID string, cooldownSecs int) bool {
	if cooldownSecs == 0 {
		return true
	}
	key := stateKey{RuleName: ruleName, ContainerID: containerID}
	last, fired := c.lastFired[key]
	if !fired {
		return true
	}
	elapsed := c.now().Sub(last)
	return elapsed >= time.Duration(cooldownSecs)*time.Second
}

// Record marks the current time as the last successful firing for the
// given (ruleName, containerID) pair (Requirement 4.1).
func (c *CooldownTracker) Record(ruleName, containerID string) {
	key := stateKey{RuleName: ruleName, ContainerID: containerID}
	c.lastFired[key] = c.now()
}

// Purge removes cooldown records for containers that are no longer active,
// preventing unbounded memory growth (Requirement 4.5).
func (c *CooldownTracker) Purge(activeContainerIDs map[string]struct{}) {
	for key := range c.lastFired {
		if _, active := activeContainerIDs[key.ContainerID]; !active {
			delete(c.lastFired, key)
		}
	}
}
