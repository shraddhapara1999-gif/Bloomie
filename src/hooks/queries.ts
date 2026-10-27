import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '../auth/AuthProvider'
import { addDays, localDateKey } from '../lib/dates'
import * as content from '../services/content'
import * as journal from '../services/journal'
import * as moods from '../services/moods'
import * as reminders from '../services/reminders'
import { fetchActivity } from '../services/account'
import { updateProfile, type ProfileUpdate } from '../services/profile'
import type { Favorite } from '../lib/types'

/** Today's date (YYYY-MM-DD) in the user's timezone. */
export function useToday(): string {
  const { timezone } = useAuth()
  return localDateKey(new Date(), timezone)
}

// Keys whose data feeds the dashboard and reports.
const ACTIVITY_KEYS = [['activity'], ['moods'], ['streak']]

function useInvalidate() {
  const qc = useQueryClient()
  return (...keys: string[][]) => Promise.all(keys.map(k => qc.invalidateQueries({ queryKey: k })))
}

// ─── Profile ────────────────────────────────────────────────────────────────

export function useUpdateProfile() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: ProfileUpdate) => updateProfile(user!.id, patch),
    onSuccess: p => qc.setQueryData(['profile', user!.id], p),
  })
}

// ─── Moods ──────────────────────────────────────────────────────────────────

export function useMoodEntries(opts: { from?: string; to?: string; limit?: number; page?: number } = {}) {
  return useQuery({ queryKey: ['moods', opts], queryFn: () => moods.listMoodEntries(opts), placeholderData: keepPreviousData })
}

export function useCreateMood() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: moods.createMoodEntry,
    onSuccess: () => inv(...ACTIVITY_KEYS),
  })
}

export function useDeleteMood() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: moods.deleteMoodEntry,
    onSuccess: () => { toast.success('Check-in deleted'); return inv(...ACTIVITY_KEYS, ['journal']) },
    onError: (e: Error) => toast.error(e.message),
  })
}

// ─── Activity (reports & dashboard) ─────────────────────────────────────────

export function useActivity(days: number, endKey?: string) {
  const today = useToday()
  const end = endKey ?? today
  const from = addDays(end, -(days - 1))
  return useQuery({
    queryKey: ['activity', from, end],
    queryFn: () => fetchActivity(from, end),
    placeholderData: keepPreviousData,
  })
}

// ─── Journal ────────────────────────────────────────────────────────────────

export function useJournalList(filters: journal.JournalFilters) {
  return useQuery({ queryKey: ['journal', 'list', filters], queryFn: () => journal.listJournalEntries(filters), placeholderData: keepPreviousData })
}

export function useJournalEntry(id: string | undefined) {
  return useQuery({ queryKey: ['journal', 'entry', id], queryFn: () => journal.getJournalEntry(id!), enabled: !!id })
}

export function useJournalDates(from: string, to: string) {
  return useQuery({ queryKey: ['journal', 'dates', from, to], queryFn: () => journal.journalDates(from, to), placeholderData: keepPreviousData })
}

export function useSaveJournal() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: Parameters<typeof journal.createJournalEntry>[0] }) =>
      id ? journal.updateJournalEntry(id, input) : journal.createJournalEntry(input),
    onSuccess: () => inv(['journal'], ...ACTIVITY_KEYS),
  })
}

export function useDeleteJournal() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: journal.deleteJournalEntry,
    onSuccess: () => inv(['journal'], ...ACTIVITY_KEYS),
  })
}

// ─── Meditation & exercises ─────────────────────────────────────────────────

export function useMeditations() {
  return useQuery({ queryKey: ['meditations'], queryFn: content.listMeditations, staleTime: 10 * 60_000 })
}

export function useMeditation(slug: string | undefined) {
  return useQuery({ queryKey: ['meditation', slug], queryFn: () => content.getMeditation(slug!), enabled: !!slug, staleTime: 10 * 60_000 })
}

export function useMeditationHistory(limit = 20) {
  return useQuery({ queryKey: ['activity', 'medHistory', limit], queryFn: () => content.listMeditationHistory(limit) })
}

export function useExercises() {
  return useQuery({ queryKey: ['exercises'], queryFn: content.listExercises, staleTime: 10 * 60_000 })
}

export function useExercise(slug: string | undefined) {
  return useQuery({ queryKey: ['exercise', slug], queryFn: () => content.getExercise(slug!), enabled: !!slug, staleTime: 10 * 60_000 })
}

export function useExerciseHistory(limit = 30) {
  return useQuery({ queryKey: ['activity', 'exHistory', limit], queryFn: () => content.listExerciseHistory(limit) })
}

export function useFavorites() {
  return useQuery({ queryKey: ['favorites'], queryFn: content.listFavorites })
}

export function useToggleFavorite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ type, id, on }: { type: Favorite['content_type']; id: string; on: boolean }) => content.setFavorite(type, id, on),
    onMutate: async ({ type, id, on }) => {
      await qc.cancelQueries({ queryKey: ['favorites'] })
      const prev = qc.getQueryData<Favorite[]>(['favorites'])
      qc.setQueryData<Favorite[]>(['favorites'], old => on
        ? [...(old ?? []), { id: `tmp-${id}`, content_type: type, content_id: id, created_at: new Date().toISOString() }]
        : (old ?? []).filter(f => !(f.content_type === type && f.content_id === id)))
      return { prev }
    },
    onError: (e: Error, _v, ctx) => { qc.setQueryData(['favorites'], ctx?.prev); toast.error(e.message) },
    onSettled: () => qc.invalidateQueries({ queryKey: ['favorites'] }),
  })
}

export function useDailyAffirmation() {
  const today = useToday()
  return useQuery({ queryKey: ['affirmation', today], queryFn: () => content.getDailyAffirmation(today), staleTime: Infinity })
}

// ─── Reminders ──────────────────────────────────────────────────────────────

export function useReminders() {
  return useQuery({ queryKey: ['reminders'], queryFn: reminders.listReminders })
}

export function useReminderDeliveries() {
  return useQuery({ queryKey: ['reminders', 'deliveries'], queryFn: () => reminders.listDeliveries(20) })
}

export function useSaveReminder() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: Parameters<typeof reminders.createReminder>[0] }) =>
      id ? reminders.updateReminder(id, input) : reminders.createReminder(input),
    onSuccess: () => inv(['reminders']),
  })
}

export function useToggleReminder() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => reminders.updateReminder(id, { enabled }),
    onSuccess: () => inv(['reminders']),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteReminder() {
  const inv = useInvalidate()
  return useMutation({
    mutationFn: reminders.deleteReminder,
    onSuccess: () => { toast.success('Reminder deleted'); return inv(['reminders']) },
    onError: (e: Error) => toast.error(e.message),
  })
}
