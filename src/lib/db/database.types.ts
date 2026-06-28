export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      rounds: {
        Row: {
          round_number: number;
          display_name: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          round_number: number;
          display_name: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["rounds"]["Insert"]>;
      };
      round_sets: {
        Row: {
          id: string;
          round_number: number;
          set_order: number;
          chart_type: "s" | "d";
          chart_level: number;
          display_label: string;
          draw_count: 7;
          max_bans: 2;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          round_number: number;
          set_order: number;
          chart_type: "s" | "d";
          chart_level: number;
          display_label: string;
          draw_count?: 7;
          max_bans?: 2;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["round_sets"]["Insert"]>;
      };
      players: {
        Row: {
          id: string;
          startgg_username: string;
          startgg_username_normalized: string;
          active: boolean;
          has_tournament_history: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          startgg_username: string;
          startgg_username_normalized: string;
          active?: boolean;
          has_tournament_history?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["players"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
