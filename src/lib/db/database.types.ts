export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type TableDefinition<Row, Insert = Row> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
};

type Timestamp = string;
type Uuid = string;

type EventScopedInsert = {
  event_id?: string;
};

type NormalizedRuntimeRpc = {
  Args: {
    p_event_id: string;
    p_payload: Json;
  };
  Returns: Json;
};

export type Database = {
  public: {
    Tables: {
      rounds: TableDefinition<
        {
          round_number: number;
          display_name: string;
          status: string;
          created_at: Timestamp;
          updated_at: Timestamp;
        },
        {
          round_number: number;
          display_name: string;
          status?: string;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        }
      >;
      event_runtime_state: TableDefinition<
        {
          event_id: string;
          current_round: number;
          rehearsal_mode: boolean;
          updated_at: Timestamp;
        },
        {
          event_id: string;
          current_round?: number;
          rehearsal_mode?: boolean;
          updated_at?: Timestamp;
        }
      >;
      round_sets: TableDefinition<
        {
          id: Uuid;
          round_number: number;
          set_order: number;
          chart_type: "s" | "d";
          chart_level: number;
          display_label: string;
          draw_count: 7;
          max_bans: 2;
          created_at: Timestamp;
          updated_at: Timestamp;
        },
        {
          id?: Uuid;
          round_number: number;
          set_order: number;
          chart_type: "s" | "d";
          chart_level: number;
          display_label: string;
          draw_count?: 7;
          max_bans?: 2;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        }
      >;
      players: TableDefinition<
        {
          id: Uuid;
          event_id: string;
          startgg_username: string;
          startgg_username_normalized: string;
          active: boolean;
          has_tournament_history: boolean;
          created_at: Timestamp;
          updated_at: Timestamp;
        },
        EventScopedInsert & {
          id?: Uuid;
          startgg_username: string;
          startgg_username_normalized: string;
          active?: boolean;
          has_tournament_history?: boolean;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        }
      >;
      charts: TableDefinition<
        {
          id: Uuid;
          source_row_hash: string | null;
          name: string;
          name_kr: string | null;
          artist: string;
          label: string | null;
          chart_type: "s" | "d";
          chart_level: number;
          display_difficulty: string;
          song_key: string;
          chart_key: string;
          source_bg_img: string | null;
          local_image_path: string | null;
          tournament_scope: boolean;
          imported_at: Timestamp;
          updated_at: Timestamp;
        },
        {
          id?: Uuid;
          source_row_hash?: string | null;
          name: string;
          name_kr?: string | null;
          artist: string;
          label?: string | null;
          chart_type: "s" | "d";
          chart_level: number;
          display_difficulty: string;
          song_key: string;
          chart_key: string;
          source_bg_img?: string | null;
          local_image_path?: string | null;
          tournament_scope?: boolean;
          imported_at?: Timestamp;
          updated_at?: Timestamp;
        }
      >;
      chart_exclusions: TableDefinition<
        {
          id: Uuid;
          event_id: string;
          chart_id: Uuid;
          excluded: boolean;
          reason: string;
          created_at: Timestamp;
          updated_at: Timestamp;
        },
        EventScopedInsert & {
          id?: Uuid;
          chart_id: Uuid;
          excluded?: boolean;
          reason: string;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        }
      >;
      admin_sessions: TableDefinition<
        {
          id: Uuid;
          event_id: string;
          session_token_hash: string;
          created_at: Timestamp;
          last_seen_at: Timestamp;
          expires_at: Timestamp;
          revoked_at: Timestamp | null;
        },
        EventScopedInsert & {
          id?: Uuid;
          session_token_hash: string;
          created_at?: Timestamp;
          last_seen_at?: Timestamp;
          expires_at: Timestamp;
          revoked_at?: Timestamp | null;
        }
      >;
      admin_actions: TableDefinition<
        {
          id: Uuid;
          event_id: string;
          admin_session_id: Uuid | null;
          action_type: string;
          action_summary: string;
          reason: string | null;
          requires_password_reentry: boolean;
          created_at: Timestamp;
          metadata: Json;
        },
        EventScopedInsert & {
          id?: Uuid;
          admin_session_id?: Uuid | null;
          action_type: string;
          action_summary: string;
          reason?: string | null;
          requires_password_reentry?: boolean;
          created_at?: Timestamp;
          metadata?: Json;
        }
      >;
      draws: TableDefinition<
        {
          id: Uuid;
          event_id: string;
          round_set_id: Uuid;
          draw_version: number;
          status: string;
          eligible_pool_count: number;
          admin_action_id: Uuid | null;
          reason: string | null;
          created_at: Timestamp;
          superseded_at: Timestamp | null;
        },
        EventScopedInsert & {
          id?: Uuid;
          round_set_id: Uuid;
          draw_version?: number;
          status?: string;
          eligible_pool_count?: number;
          admin_action_id?: Uuid | null;
          reason?: string | null;
          created_at?: Timestamp;
          superseded_at?: Timestamp | null;
        }
      >;
      drawn_charts: TableDefinition<
        {
          id: Uuid;
          event_id: string;
          draw_id: Uuid;
          chart_id: Uuid;
          draw_order: number;
          created_at: Timestamp;
        },
        EventScopedInsert & {
          id?: Uuid;
          draw_id: Uuid;
          chart_id: Uuid;
          draw_order: number;
          created_at?: Timestamp;
        }
      >;
      voting_windows: TableDefinition<
        {
          id: Uuid;
          event_id: string;
          round_number: number;
          status: string;
          opened_at: Timestamp | null;
          closes_at: Timestamp | null;
          paused_at: Timestamp | null;
          paused_from_status: string | null;
          remaining_seconds_at_pause: number | null;
          remaining_ms_when_paused: number | null;
          extension_used: boolean;
          final_warning_started_at: Timestamp | null;
          closed_at: Timestamp | null;
          eligible_players: Json;
          created_at: Timestamp;
          updated_at: Timestamp;
        },
        EventScopedInsert & {
          id?: Uuid;
          round_number: number;
          status?: string;
          opened_at?: Timestamp | null;
          closes_at?: Timestamp | null;
          paused_at?: Timestamp | null;
          paused_from_status?: string | null;
          remaining_seconds_at_pause?: number | null;
          remaining_ms_when_paused?: number | null;
          extension_used?: boolean;
          final_warning_started_at?: Timestamp | null;
          closed_at?: Timestamp | null;
          eligible_players?: Json;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        }
      >;
      round_player_eligibility: TableDefinition<
        {
          id: Uuid;
          event_id: string;
          round_number: number;
          player_id: Uuid;
          active_at_round_start: boolean;
          added_by_admin_action_id: Uuid | null;
          reason: string | null;
          added_at: Timestamp | null;
          created_at: Timestamp;
        },
        EventScopedInsert & {
          id?: Uuid;
          round_number: number;
          player_id: Uuid;
          active_at_round_start?: boolean;
          added_by_admin_action_id?: Uuid | null;
          reason?: string | null;
          added_at?: Timestamp | null;
          created_at?: Timestamp;
        }
      >;
      active_voter_presence: TableDefinition<
        {
          id: Uuid;
          event_id: string;
          round_number: number;
          player_id: Uuid;
          device_id: string;
          claimed_at: Timestamp;
          last_seen_at: Timestamp;
          expires_at: Timestamp;
          user_agent: string | null;
        },
        EventScopedInsert & {
          id?: Uuid;
          round_number?: number;
          player_id: Uuid;
          device_id: string;
          claimed_at?: Timestamp;
          last_seen_at?: Timestamp;
          expires_at: Timestamp;
          user_agent?: string | null;
        }
      >;
      ballots: TableDefinition<
        {
          id: Uuid;
          event_id: string;
          round_number: number;
          player_id: Uuid;
          submitted: boolean;
          submitted_at: Timestamp | null;
          last_revision_at: Timestamp | null;
          latest_revision_number: number;
          manual_override: boolean;
          override_admin_action_id: Uuid | null;
          override_reason: string | null;
          replaced_existing_ballot: boolean;
          invalidated_at: Timestamp | null;
          invalidated_by_admin_action_id: Uuid | null;
          invalidation_reason: string | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        },
        EventScopedInsert & {
          id?: Uuid;
          round_number: number;
          player_id: Uuid;
          submitted?: boolean;
          submitted_at?: Timestamp | null;
          last_revision_at?: Timestamp | null;
          latest_revision_number?: number;
          manual_override?: boolean;
          override_admin_action_id?: Uuid | null;
          override_reason?: string | null;
          replaced_existing_ballot?: boolean;
          invalidated_at?: Timestamp | null;
          invalidated_by_admin_action_id?: Uuid | null;
          invalidation_reason?: string | null;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        }
      >;
      ballot_choices: TableDefinition<
        {
          id: Uuid;
          event_id: string;
          ballot_id: Uuid;
          draw_id: Uuid;
          round_set_id: Uuid;
          no_bans: boolean;
          banned_chart_ids: Uuid[];
          created_at: Timestamp;
          updated_at: Timestamp;
        },
        EventScopedInsert & {
          id?: Uuid;
          ballot_id: Uuid;
          draw_id: Uuid;
          round_set_id: Uuid;
          no_bans?: boolean;
          banned_chart_ids?: Uuid[];
          created_at?: Timestamp;
          updated_at?: Timestamp;
        }
      >;
      ballot_revisions: TableDefinition<
        {
          id: Uuid;
          event_id: string;
          ballot_id: Uuid;
          revision_number: number;
          accepted: boolean;
          submitted_at: Timestamp;
          payload: Json;
          failure_reason: string | null;
        },
        EventScopedInsert & {
          id?: Uuid;
          ballot_id: Uuid;
          revision_number: number;
          accepted?: boolean;
          submitted_at?: Timestamp;
          payload: Json;
          failure_reason?: string | null;
        }
      >;
      ballot_invalidations: TableDefinition<
        {
          id: Uuid;
          event_id: string;
          round_number: number;
          invalidated_at: Timestamp;
          reason: string;
          admin_session_id: string;
          ballot_ids: Uuid[];
          payload: Json;
          created_at: Timestamp;
        },
        EventScopedInsert & {
          id?: Uuid;
          round_number: number;
          invalidated_at: Timestamp;
          reason: string;
          admin_session_id: string;
          ballot_ids?: Uuid[];
          payload?: Json;
          created_at?: Timestamp;
        }
      >;
      result_snapshots: TableDefinition<
        {
          id: Uuid;
          event_id: string;
          round_number: number;
          computed_at: Timestamp;
          stage_reveal_started_at: Timestamp | null;
          stage_revealed_at: Timestamp | null;
          reveal_phase: string;
          reveal_phase_started_at: Timestamp | null;
          final_revealed_at: Timestamp | null;
          eligible_players: Json;
          admin_action_id: Uuid | null;
          metadata: Json;
        },
        EventScopedInsert & {
          id?: Uuid;
          round_number: number;
          computed_at?: Timestamp;
          stage_reveal_started_at?: Timestamp | null;
          stage_revealed_at?: Timestamp | null;
          reveal_phase?: string;
          reveal_phase_started_at?: Timestamp | null;
          final_revealed_at?: Timestamp | null;
          eligible_players?: Json;
          admin_action_id?: Uuid | null;
          metadata?: Json;
        }
      >;
      result_rows: TableDefinition<
        {
          id: Uuid;
          event_id: string;
          result_snapshot_id: Uuid;
          draw_id: Uuid;
          round_set_id: Uuid;
          chart_id: Uuid;
          ban_count: number;
          reveal_order: number;
          is_selected: boolean;
          is_tiebreak_candidate: boolean;
          created_at: Timestamp;
        },
        EventScopedInsert & {
          id?: Uuid;
          result_snapshot_id: Uuid;
          draw_id: Uuid;
          round_set_id: Uuid;
          chart_id: Uuid;
          ban_count?: number;
          reveal_order: number;
          is_selected?: boolean;
          is_tiebreak_candidate?: boolean;
          created_at?: Timestamp;
        }
      >;
      tiebreaks: TableDefinition<
        {
          id: Uuid;
          event_id: string;
          result_snapshot_id: Uuid;
          draw_id: Uuid;
          round_set_id: Uuid;
          candidate_chart_ids: Uuid[];
          winner_chart_id: Uuid;
          decided_at: Timestamp;
          decision_source: string;
          admin_action_id: Uuid | null;
          winner_reveal_started_at: Timestamp | null;
        },
        EventScopedInsert & {
          id?: Uuid;
          result_snapshot_id: Uuid;
          draw_id: Uuid;
          round_set_id: Uuid;
          candidate_chart_ids: Uuid[];
          winner_chart_id: Uuid;
          decided_at?: Timestamp;
          decision_source?: string;
          admin_action_id?: Uuid | null;
          winner_reveal_started_at?: Timestamp | null;
        }
      >;
      host_locks: TableDefinition<
        {
          id: Uuid;
          event_id: string;
          lock_name: string;
          admin_session_id: Uuid | null;
          owner_session_id: string | null;
          host_token_hash: string;
          acquired_at: Timestamp;
          heartbeat_at: Timestamp;
          expires_at: Timestamp;
          released_at: Timestamp | null;
        },
        EventScopedInsert & {
          id?: Uuid;
          lock_name?: string;
          admin_session_id?: Uuid | null;
          owner_session_id?: string | null;
          host_token_hash: string;
          acquired_at?: Timestamp;
          heartbeat_at?: Timestamp;
          expires_at: Timestamp;
          released_at?: Timestamp | null;
        }
      >;
      image_assets: TableDefinition<
        {
          id: Uuid;
          chart_id: Uuid | null;
          remote_url: string | null;
          local_path: string | null;
          status: string;
          failure_reason: string | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        },
        {
          id?: Uuid;
          chart_id?: Uuid | null;
          remote_url?: string | null;
          local_path?: string | null;
          status?: string;
          failure_reason?: string | null;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        }
      >;
      tournament_state_snapshots: TableDefinition<
        {
          id: string;
          schema_version: number;
          state: Json;
          updated_at: Timestamp;
        },
        {
          id?: string;
          schema_version?: number;
          state: Json;
          updated_at?: Timestamp;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      normalized_submit_ballot: NormalizedRuntimeRpc;
      normalized_manual_ballot_override: NormalizedRuntimeRpc;
      normalized_claim_voter_presence: NormalizedRuntimeRpc;
      normalized_touch_voter_presence: NormalizedRuntimeRpc;
      normalized_acquire_host_lock: NormalizedRuntimeRpc;
      normalized_heartbeat_host_lock: NormalizedRuntimeRpc;
      normalized_release_host_lock: NormalizedRuntimeRpc;
      normalized_open_voting_window: NormalizedRuntimeRpc;
      normalized_pause_voting_window: NormalizedRuntimeRpc;
      normalized_resume_voting_window: NormalizedRuntimeRpc;
      normalized_close_voting_window: NormalizedRuntimeRpc;
      normalized_reopen_voting_window: NormalizedRuntimeRpc;
      normalized_advance_voting_timer: NormalizedRuntimeRpc;
      normalized_draw_round_set: NormalizedRuntimeRpc;
      normalized_reroll_one_chart: NormalizedRuntimeRpc;
      normalized_reroll_round_set: NormalizedRuntimeRpc;
      normalized_reroll_full_round: NormalizedRuntimeRpc;
      normalized_invalidate_post_vote_reroll_ballots: NormalizedRuntimeRpc;
      normalized_compute_results: NormalizedRuntimeRpc;
      normalized_advance_result_reveal: NormalizedRuntimeRpc;
      normalized_mark_results_revealed: NormalizedRuntimeRpc;
      normalized_override_result: NormalizedRuntimeRpc;
      normalized_reset_round: NormalizedRuntimeRpc;
      normalized_create_admin_session: NormalizedRuntimeRpc;
      normalized_touch_admin_session: NormalizedRuntimeRpc;
      normalized_logout_admin_session: NormalizedRuntimeRpc;
      normalized_revoke_admin_session: NormalizedRuntimeRpc;
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
