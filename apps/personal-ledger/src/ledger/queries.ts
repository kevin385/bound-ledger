import { queryOptions } from "@tanstack/react-query"

import {
  getAttempts,
  getDashboard,
  getEvent,
  getPendingConfirmations,
  queryEvents,
  queryProposals,
} from "./functions"
import {
  dashboardRange,
  type QueryEventsInput,
  type ServerResult,
} from "./contracts"

export const unwrapResult = <A>(result: ServerResult<A>): A => {
  if (result.ok) return result.data
  throw new Error(result.error.code)
}

export const dashboardQuery = queryOptions({
  queryKey: ["dashboard", dashboardRange],
  queryFn: () => getDashboard({ data: dashboardRange }).then(unwrapResult),
})

export const eventsQuery = (input: QueryEventsInput) =>
  queryOptions({
    queryKey: ["events", input],
    queryFn: () => queryEvents({ data: input }).then(unwrapResult),
  })

export const eventQuery = (eventId: string) =>
  queryOptions({
    queryKey: ["event", eventId],
    queryFn: () => getEvent({ data: { eventId } }).then(unwrapResult),
  })

export const proposalsQuery = queryOptions({
  queryKey: ["proposals"],
  queryFn: () => queryProposals({ data: {} }).then(unwrapResult),
})

export const confirmationsQuery = queryOptions({
  queryKey: ["confirmations"],
  queryFn: () => getPendingConfirmations({ data: {} }).then(unwrapResult),
})

export const attemptsQuery = queryOptions({
  queryKey: ["attempts"],
  queryFn: () => getAttempts({ data: {} }).then(unwrapResult),
})
