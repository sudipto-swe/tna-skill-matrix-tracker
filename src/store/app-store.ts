"use client";
import { create } from "zustand";
import type { SessionUser } from "@/lib/types";

export type ViewId =
  | "dashboard" | "employees" | "employee-profile" | "competencies" | "skill-matrix"
  | "tna" | "calendar" | "attendance" | "qualifications" | "reports" | "import"
  | "users" | "audit" | "settings" | "my-training";

interface AppState {
  user: SessionUser | null;
  view: ViewId;
  selectedEmployeeId: string | null;
  selectedSessionId: string | null;
  qualificationFilter: string;
  calendarMonth: string; // YYYY-MM
  setUser: (u: SessionUser | null) => void;
  setView: (v: ViewId) => void;
  openEmployee: (id: string) => void;
  openSession: (id: string, view?: ViewId) => void;
  setQualificationFilter: (f: string) => void;
  setCalendarMonth: (m: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  view: "dashboard",
  selectedEmployeeId: null,
  selectedSessionId: null,
  qualificationFilter: "all",
  calendarMonth: new Date().toISOString().slice(0, 7),
  setUser: (user) => set({ user, view: "dashboard" }),
  setView: (view) => set({ view }),
  openEmployee: (selectedEmployeeId) => set({ selectedEmployeeId, view: "employee-profile" }),
  openSession: (selectedSessionId, view = "attendance") => set({ selectedSessionId, view }),
  setQualificationFilter: (qualificationFilter) => set({ qualificationFilter, view: "qualifications" }),
  setCalendarMonth: (calendarMonth) => set({ calendarMonth }),
}));

export const can = (user: SessionUser | null, permission: string) => !!user?.permissions.includes(permission);
