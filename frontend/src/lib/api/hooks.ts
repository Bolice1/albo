"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type NewHealthInput, type NewReferral } from "./client";
import type { NotificationPreferences, ProfileUpdate } from "./types";

export const qk = {
  me: ["me"] as const,
  features: ["features"] as const,
  healthInputs: (history: boolean) => ["health-inputs", { history }] as const,
  risk: ["risk-assessments"] as const,
  riskOne: (id: string) => ["risk-assessments", id] as const,
  facilities: (q: string, service: string) => ["facilities", { q, service }] as const,
  referrals: ["referrals"] as const,
  notifications: ["notifications"] as const,
  trends: ["trends"] as const,
  environment: ["environment"] as const,
  reports: ["reports"] as const,
  consentPurposes: ["consent-purposes"] as const,
  consents: ["consents"] as const,
  activity: ["activity"] as const,
  notificationPreferences: ["notification-preferences"] as const,
};

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: api.getMe });
export const useFeatures = () => useQuery({ queryKey: qk.features, queryFn: api.getFeatures });
export const useHealthInputs = (includeHistory = false) =>
  useQuery({ queryKey: qk.healthInputs(includeHistory), queryFn: () => api.listHealthInputs({ includeHistory }) });
export const useRiskAssessments = () => useQuery({ queryKey: qk.risk, queryFn: api.listRiskAssessments });
export const useRiskAssessment = (id: string) =>
  useQuery({ queryKey: qk.riskOne(id), queryFn: () => api.getRiskAssessment(id) });
export const useFacilities = (q = "", service = "") =>
  useQuery({ queryKey: qk.facilities(q, service), queryFn: () => api.listFacilities({ q, service }) });
export const useReferrals = () => useQuery({ queryKey: qk.referrals, queryFn: api.listReferrals });
export const useNotifications = () => useQuery({ queryKey: qk.notifications, queryFn: api.listNotifications });
export const useTrends = () => useQuery({ queryKey: qk.trends, queryFn: api.getTrends });
export const useEnvironment = () => useQuery({ queryKey: qk.environment, queryFn: api.getEnvironment, retry: false });
export const useReports = () => useQuery({ queryKey: qk.reports, queryFn: api.listReports });
export const useConsentPurposes = () => useQuery({ queryKey: qk.consentPurposes, queryFn: api.listConsentPurposes });
export const useConsents = () => useQuery({ queryKey: qk.consents, queryFn: api.listConsents });
export const useActivity = () => useQuery({ queryKey: qk.activity, queryFn: api.listActivity });

export function useSaveHealthInput() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ correctId, input }: { correctId?: string; input: NewHealthInput }) =>
      correctId ? api.correctHealthInput(correctId, input) : api.createHealthInput(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["health-inputs"] }),
  });
}

export function useRequestRiskAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.requestRiskAssessment,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.risk }),
  });
}

export function useCreateReferral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewReferral) => api.createReferral(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.referrals }),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.markNotificationRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
}

export function useRequestReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.requestReport,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.reports }),
  });
}

export function useConsentToggle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { action: "grant"; code: string; version: string } | { action: "withdraw"; id: string }) =>
      v.action === "grant" ? api.grantConsent(v.code, v.version) : api.withdrawConsent(v.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.consents });
      qc.invalidateQueries({ queryKey: qk.environment });
    },
  });
}

export const useNotificationPreferences = () =>
  useQuery({ queryKey: qk.notificationPreferences, queryFn: api.getNotificationPreferences });

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Omit<NotificationPreferences, "updated_at">>) => api.updateNotificationPreferences(input),
    onSuccess: (data) => qc.setQueryData(qk.notificationPreferences, data),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileUpdate) => api.updateProfile(input),
    onSuccess: (data) => qc.setQueryData(qk.me, data),
  });
}
