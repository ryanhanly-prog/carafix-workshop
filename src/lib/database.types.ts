export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_briefings: {
        Row: {
          briefing_date: string
          content_md: string
          generated_at: string | null
          id: string
          location_id: string | null
        }
        Insert: {
          briefing_date: string
          content_md: string
          generated_at?: string | null
          id?: string
          location_id?: string | null
        }
        Update: {
          briefing_date?: string
          content_md?: string
          generated_at?: string | null
          id?: string
          location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_briefings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      app_users: {
        Row: {
          created_at: string | null
          default_location_id: string | null
          full_name: string | null
          id: string
          role: string
        }
        Insert: {
          created_at?: string | null
          default_location_id?: string | null
          full_name?: string | null
          id: string
          role: string
        }
        Update: {
          created_at?: string | null
          default_location_id?: string | null
          full_name?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_users_default_location_id_fkey"
            columns: ["default_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      bays: {
        Row: {
          active: boolean | null
          id: string
          location_id: string | null
          name: string
          type: Database["public"]["Enums"]["bay_type"]
        }
        Insert: {
          active?: boolean | null
          id?: string
          location_id?: string | null
          name: string
          type?: Database["public"]["Enums"]["bay_type"]
        }
        Update: {
          active?: boolean | null
          id?: string
          location_id?: string | null
          name?: string
          type?: Database["public"]["Enums"]["bay_type"]
        }
        Relationships: [
          {
            foreignKeyName: "bays_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      holidays: {
        Row: {
          date: string
          id: string
          location_id: string | null
          name: string | null
        }
        Insert: {
          date: string
          id?: string
          location_id?: string | null
          name?: string | null
        }
        Update: {
          date?: string
          id?: string
          location_id?: string | null
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holidays_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_attachments: {
        Row: {
          caption: string | null
          created_at: string | null
          id: string
          job_id: string | null
          kind: string | null
          storage_path: string
          task_id: string | null
          transcript: string | null
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          kind?: string | null
          storage_path: string
          task_id?: string | null
          transcript?: string | null
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          id?: string
          job_id?: string | null
          kind?: string | null
          storage_path?: string
          task_id?: string | null
          transcript?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_attachments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_attachments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "v_job_rollup"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      job_status_log: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          from_status: Database["public"]["Enums"]["job_status"] | null
          id: string
          job_id: string | null
          reason: string | null
          to_status: Database["public"]["Enums"]["job_status"] | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["job_status"] | null
          id?: string
          job_id?: string | null
          reason?: string | null
          to_status?: Database["public"]["Enums"]["job_status"] | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["job_status"] | null
          id?: string
          job_id?: string | null
          reason?: string | null
          to_status?: Database["public"]["Enums"]["job_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "job_status_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_status_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "v_job_rollup"
            referencedColumns: ["job_id"]
          },
        ]
      }
      jobs: {
        Row: {
          actual_finish_date: string | null
          assigned_tech_id: string | null
          bay_id: string | null
          billing_type: Database["public"]["Enums"]["billing_type"]
          booking_date: string | null
          created_at: string | null
          customer_id: string
          customer_promised_date: string | null
          description: string | null
          expected_finish_date: string | null
          hold_reason: string | null
          id: string
          insurance_claim_number: string | null
          internal_notes: string | null
          invoice_status: Database["public"]["Enums"]["invoice_status"] | null
          job_number: string
          job_start_date: string | null
          job_type: Database["public"]["Enums"]["job_type"] | null
          location_id: string
          mechanic_desk_ref: string | null
          picked_up_date: string | null
          pickup_booked_date: string | null
          primary_skill_id: string | null
          priority: Database["public"]["Enums"]["priority_level"]
          quoted_hours: number | null
          status: Database["public"]["Enums"]["job_status"]
          total_quoted_hours: number | null
          updated_at: string | null
          van_id: string
          warranty_reference: string | null
        }
        Insert: {
          actual_finish_date?: string | null
          assigned_tech_id?: string | null
          bay_id?: string | null
          billing_type?: Database["public"]["Enums"]["billing_type"]
          booking_date?: string | null
          created_at?: string | null
          customer_id: string
          customer_promised_date?: string | null
          description?: string | null
          expected_finish_date?: string | null
          hold_reason?: string | null
          id?: string
          insurance_claim_number?: string | null
          internal_notes?: string | null
          invoice_status?: Database["public"]["Enums"]["invoice_status"] | null
          job_number: string
          job_start_date?: string | null
          job_type?: Database["public"]["Enums"]["job_type"] | null
          location_id: string
          mechanic_desk_ref?: string | null
          picked_up_date?: string | null
          pickup_booked_date?: string | null
          primary_skill_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          quoted_hours?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          total_quoted_hours?: number | null
          updated_at?: string | null
          van_id: string
          warranty_reference?: string | null
        }
        Update: {
          actual_finish_date?: string | null
          assigned_tech_id?: string | null
          bay_id?: string | null
          billing_type?: Database["public"]["Enums"]["billing_type"]
          booking_date?: string | null
          created_at?: string | null
          customer_id?: string
          customer_promised_date?: string | null
          description?: string | null
          expected_finish_date?: string | null
          hold_reason?: string | null
          id?: string
          insurance_claim_number?: string | null
          internal_notes?: string | null
          invoice_status?: Database["public"]["Enums"]["invoice_status"] | null
          job_number?: string
          job_start_date?: string | null
          job_type?: Database["public"]["Enums"]["job_type"] | null
          location_id?: string
          mechanic_desk_ref?: string | null
          picked_up_date?: string | null
          pickup_booked_date?: string | null
          primary_skill_id?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          quoted_hours?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          total_quoted_hours?: number | null
          updated_at?: string | null
          van_id?: string
          warranty_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_assigned_tech_id_fkey"
            columns: ["assigned_tech_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_assigned_tech_id_fkey"
            columns: ["assigned_tech_id"]
            isOneToOne: false
            referencedRelation: "v_tech_weekly_utilisation"
            referencedColumns: ["technician_id"]
          },
          {
            foreignKeyName: "jobs_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: false
            referencedRelation: "bays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_primary_skill_id_fkey"
            columns: ["primary_skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_primary_skill_id_fkey"
            columns: ["primary_skill_id"]
            isOneToOne: false
            referencedRelation: "v_skill_daily_demand"
            referencedColumns: ["skill_id"]
          },
          {
            foreignKeyName: "jobs_van_id_fkey"
            columns: ["van_id"]
            isOneToOne: false
            referencedRelation: "vans"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean | null
          address: string | null
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean | null
          address?: string | null
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean | null
          address?: string | null
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      parts: {
        Row: {
          cost: number | null
          created_at: string | null
          description: string
          eta_date: string | null
          id: string
          is_critical: boolean | null
          job_id: string
          notes: string | null
          ordered_date: string | null
          quantity: number | null
          received_date: string | null
          status: Database["public"]["Enums"]["part_status"]
          supplier: string | null
          task_id: string | null
        }
        Insert: {
          cost?: number | null
          created_at?: string | null
          description: string
          eta_date?: string | null
          id?: string
          is_critical?: boolean | null
          job_id: string
          notes?: string | null
          ordered_date?: string | null
          quantity?: number | null
          received_date?: string | null
          status?: Database["public"]["Enums"]["part_status"]
          supplier?: string | null
          task_id?: string | null
        }
        Update: {
          cost?: number | null
          created_at?: string | null
          description?: string
          eta_date?: string | null
          id?: string
          is_critical?: boolean | null
          job_id?: string
          notes?: string | null
          ordered_date?: string | null
          quantity?: number | null
          received_date?: string | null
          status?: Database["public"]["Enums"]["part_status"]
          supplier?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "v_job_rollup"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "parts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      promise_date_log: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string
          job_id: string | null
          new_date: string | null
          old_date: string | null
          reason: string | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          job_id?: string | null
          new_date?: string | null
          old_date?: string | null
          reason?: string | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          job_id?: string | null
          new_date?: string | null
          old_date?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promise_date_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promise_date_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "v_job_rollup"
            referencedColumns: ["job_id"]
          },
        ]
      }
      skills: {
        Row: {
          description: string | null
          id: string
          name: string
        }
        Insert: {
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          actual_hours: number | null
          assigned_tech_id: string | null
          completed_at: string | null
          created_at: string | null
          depends_on_task_id: string | null
          description: string | null
          id: string
          job_id: string
          notes: string | null
          quoted_hours: number
          scheduled_date: string | null
          scheduled_hours: number | null
          sequence_order: number
          skill_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
        }
        Insert: {
          actual_hours?: number | null
          assigned_tech_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          depends_on_task_id?: string | null
          description?: string | null
          id?: string
          job_id: string
          notes?: string | null
          quoted_hours: number
          scheduled_date?: string | null
          scheduled_hours?: number | null
          sequence_order: number
          skill_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
        }
        Update: {
          actual_hours?: number | null
          assigned_tech_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          depends_on_task_id?: string | null
          description?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          quoted_hours?: number
          scheduled_date?: string | null
          scheduled_hours?: number | null
          sequence_order?: number
          skill_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_tech_id_fkey"
            columns: ["assigned_tech_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_tech_id_fkey"
            columns: ["assigned_tech_id"]
            isOneToOne: false
            referencedRelation: "v_tech_weekly_utilisation"
            referencedColumns: ["technician_id"]
          },
          {
            foreignKeyName: "tasks_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "v_job_rollup"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "tasks_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "v_skill_daily_demand"
            referencedColumns: ["skill_id"]
          },
        ]
      }
      technician_skills: {
        Row: {
          level: Database["public"]["Enums"]["skill_level"]
          skill_id: string
          technician_id: string
        }
        Insert: {
          level?: Database["public"]["Enums"]["skill_level"]
          skill_id: string
          technician_id: string
        }
        Update: {
          level?: Database["public"]["Enums"]["skill_level"]
          skill_id?: string
          technician_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "v_skill_daily_demand"
            referencedColumns: ["skill_id"]
          },
          {
            foreignKeyName: "technician_skills_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_skills_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "v_tech_weekly_utilisation"
            referencedColumns: ["technician_id"]
          },
        ]
      }
      technicians: {
        Row: {
          active: boolean | null
          auth_user_id: string | null
          colour: string | null
          created_at: string | null
          email: string | null
          id: string
          location_id: string | null
          name: string
          phone: string | null
          productive_hours_per_day: number | null
          role: Database["public"]["Enums"]["tech_role"] | null
          weekly_capacity_hours: number | null
        }
        Insert: {
          active?: boolean | null
          auth_user_id?: string | null
          colour?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          location_id?: string | null
          name: string
          phone?: string | null
          productive_hours_per_day?: number | null
          role?: Database["public"]["Enums"]["tech_role"] | null
          weekly_capacity_hours?: number | null
        }
        Update: {
          active?: boolean | null
          auth_user_id?: string | null
          colour?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          location_id?: string | null
          name?: string
          phone?: string | null
          productive_hours_per_day?: number | null
          role?: Database["public"]["Enums"]["tech_role"] | null
          weekly_capacity_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "technicians_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      vans: {
        Row: {
          created_at: string | null
          customer_id: string | null
          id: string
          make: string | null
          model: string | null
          notes: string | null
          rego: string | null
          year: number | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          id?: string
          make?: string | null
          model?: string | null
          notes?: string | null
          rego?: string | null
          year?: number | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          id?: string
          make?: string | null
          model?: string | null
          notes?: string | null
          rego?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_job_rollup: {
        Row: {
          customer_promised_date: string | null
          estimated_days: number | null
          expected_finish_date: string | null
          invoice_status: Database["public"]["Enums"]["invoice_status"] | null
          is_delayed: boolean | null
          is_pickup_ready: boolean | null
          is_urgent: boolean | null
          job_id: string | null
          job_number: string | null
          last_scheduled_date: string | null
          location_id: string | null
          status: Database["public"]["Enums"]["job_status"] | null
          task_count: number | null
          tasks_done: number | null
          total_quoted_hours: number | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_skill_daily_demand: {
        Row: {
          demanded_hours: number | null
          scheduled_date: string | null
          skill_id: string | null
          skill_name: string | null
          task_count: number | null
        }
        Relationships: []
      }
      v_tech_daily_load: {
        Row: {
          scheduled_date: string | null
          scheduled_hours: number | null
          task_count: number | null
          technician_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_tech_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_tech_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "v_tech_weekly_utilisation"
            referencedColumns: ["technician_id"]
          },
        ]
      }
      v_tech_weekly_utilisation: {
        Row: {
          name: string | null
          scheduled_hours: number | null
          technician_id: string | null
          utilisation_pct: number | null
          week_start: string | null
          weekly_capacity_hours: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      is_controller: { Args: never; Returns: boolean }
    }
    Enums: {
      bay_type: "Drive-in Bay" | "Yard Slot" | "Offsite Storage"
      billing_type: "Private" | "Insurance" | "Warranty" | "Dealer"
      invoice_status: "Not Invoiced" | "Draft" | "Sent" | "Complete"
      job_status:
        | "Booked"
        | "Arrived"
        | "In Progress"
        | "On Hold"
        | "Completed"
        | "QA Check"
        | "Invoiced"
        | "Picked Up"
      job_type: "Servicing" | "Repairs" | "Upgrades & Installation" | "Other"
      part_status: "Needed" | "Ordered" | "Received" | "Fitted" | "Cancelled"
      priority_level: "Low" | "Normal" | "High" | "Urgent"
      skill_level: "learning" | "competent" | "primary"
      task_status:
        | "Not Started"
        | "In Progress"
        | "Waiting on Parts"
        | "QA Complete"
        | "Done"
      tech_role: "Service Tech" | "Caravan Repairer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      bay_type: ["Drive-in Bay", "Yard Slot", "Offsite Storage"],
      billing_type: ["Private", "Insurance", "Warranty", "Dealer"],
      invoice_status: ["Not Invoiced", "Draft", "Sent", "Complete"],
      job_status: [
        "Booked",
        "Arrived",
        "In Progress",
        "On Hold",
        "Completed",
        "QA Check",
        "Invoiced",
        "Picked Up",
      ],
      job_type: ["Servicing", "Repairs", "Upgrades & Installation", "Other"],
      part_status: ["Needed", "Ordered", "Received", "Fitted", "Cancelled"],
      priority_level: ["Low", "Normal", "High", "Urgent"],
      skill_level: ["learning", "competent", "primary"],
      task_status: [
        "Not Started",
        "In Progress",
        "Waiting on Parts",
        "QA Complete",
        "Done",
      ],
      tech_role: ["Service Tech", "Caravan Repairer"],
    },
  },
} as const
