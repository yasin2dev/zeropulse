package ruleengine

// stateKey uniquely identifies a (RuleName, ContainerID) pair.
type stateKey struct {
	RuleName    string
	ContainerID string
}

// StateTracker tracks consecutive threshold breach counts for each
// (RuleName, ContainerID) pair in memory. State is never persisted to
// disk; it resets to zero on agent restart (Requirement 3.5).
type StateTracker struct {
	counts map[stateKey]int
}

// NewStateTracker creates a new StateTracker with zeroed counters.
func NewStateTracker() *StateTracker {
	return &StateTracker{
		counts: make(map[stateKey]int),
	}
}

// Record records a period result for the given (ruleName, containerID) pair.
// If breach is true, the consecutive counter is incremented; if false, it
// is reset to zero (Requirement 3.1, 3.2).
// Returns the current counter value after the update.
func (s *StateTracker) Record(ruleName, containerID string, breach bool) int {
	key := stateKey{RuleName: ruleName, ContainerID: containerID}
	if breach {
		s.counts[key]++
	} else {
		s.counts[key] = 0
	}
	return s.counts[key]
}

// Purge removes state entries for containers that are no longer in the
// active set, preventing unbounded memory growth (Requirement 3.4).
func (s *StateTracker) Purge(activeContainerIDs map[string]struct{}) {
	for key := range s.counts {
		if _, active := activeContainerIDs[key.ContainerID]; !active {
			delete(s.counts, key)
		}
	}
}
