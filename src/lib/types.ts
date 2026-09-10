export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type OrderStatus = "waiting" | "processing" | "completed" | "cancelled";
export type TopupStatus = "pending" | "approved" | "rejected";
export type UserRole = "customer" | "lab" | "admin";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          nickname: string | null;
          phone: string | null;
          avatar_url: string | null;
          role: UserRole;
          credit_balance: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string; email: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          user_id: string;
          sperm_code: string;
          patient_full_name: string;
          patient_nickname: string | null;
          date_of_birth: string;
          age: number;
          phone: string;
          email: string;
          status: OrderStatus;
          price_credits: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["orders"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["orders"]["Row"]>;
        Relationships: [];
      };
      topups: {
        Row: {
          id: string;
          user_id: string;
          amount_credits: number;
          transfer_reference: string | null;
          slip_url: string | null;
          status: TopupStatus;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["topups"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["topups"]["Row"]>;
        Relationships: [];
      };
      lab_results: {
        Row: {
          id: string;
          order_id: string;
          sperm_code: string;
          video_url: string | null;
          metrics: Json;
          clinical_band: string;
          recommendation: string;
          report_text: string;
          published_by: string | null;
          published_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["lab_results"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["lab_results"]["Row"]>;
        Relationships: [];
      };
    };
    Functions: {
      create_order: {
        Args: {
          p_full_name: string;
          p_nickname: string | null;
          p_date_of_birth: string;
          p_age: number;
          p_phone: string;
          p_email: string;
        };
        Returns: Database["public"]["Tables"]["orders"]["Row"];
      };
      approve_topup: {
        Args: { p_topup_id: string };
        Returns: void;
      };
      reject_topup: {
        Args: { p_topup_id: string };
        Returns: void;
      };
      publish_lab_result: {
        Args: {
          p_sperm_code: string;
          p_video_url: string | null;
          p_metrics: Json;
          p_clinical_band: string;
          p_recommendation: string;
          p_report_text: string;
        };
        Returns: void;
      };
    };
    Enums: {
      order_status: OrderStatus;
      topup_status: TopupStatus;
      user_role: UserRole;
    };
    CompositeTypes: Record<never, never>;
    Views: Record<never, never>;
  };
};
