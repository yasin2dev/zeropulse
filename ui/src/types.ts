export type RuntimeMode = 'docker' | 'standalone';

export type HealthStatus = 'ok' | 'warning' | 'critical' | 'cooldown';

export interface SystemOverview {
  mode: RuntimeMode;
  total_containers: number;
  running_containers: number;
  system_cpu_percent: number;
  system_mem_used_bytes: number;
  system_mem_total_bytes: number;
  stress_index_1m: number;
}

export interface ContainerCard {
  id: string;
  name: string;
  image: string;
  status: string;
  cpu_percent: number;
  mem_percent: number;
  mem_usage_bytes: number;
  mem_limit_bytes: number;
  cpu_throttled_periods: number;
  cpu_throttled_time_ns: number;
  net_rx_bytes: number;
  net_tx_bytes: number;
  health_status: HealthStatus;
}

export interface MetricsEventPayload {
  timestamp: string;
  system: SystemOverview;
  containers: ContainerCard[];
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  container_id?: string;
  container_name?: string;
  rule_name?: string;
  metric_type?: string;
  current_value?: number;
  threshold?: number;
  consecutive_count?: number;
  action?: string;
  dry_run: boolean;
  status: string;
  message: string;
}

export type ConnectionState = 'connected' | 'reconnecting' | 'disconnected';

export interface UserAccount {
  id: string;
  username: string;
  role: 'admin' | 'viewer';
  created_at: string;
  updated_at: string;
}

export interface AuthStatus {
  auth_enabled: boolean;
  initialized: boolean;
  authenticated: boolean;
  user?: {
    username: string;
    role: string;
  };
}
