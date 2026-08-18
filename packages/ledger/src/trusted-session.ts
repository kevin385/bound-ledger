import { Context, Layer } from "effect"

export interface Session {
  readonly actorId: string
  readonly activeWorkspaceId: string
  readonly activeLedgerId?: string
  readonly readableAccountIds: ReadonlySet<string>
  readonly mutableAccountIds: ReadonlySet<string>
}

export const TrustedSession = Context.Service<Session>(
  "@bound/ledger/TrustedSession",
)

export const makeTrustedSessionLayer = (
  session: Session,
): Layer.Layer<Session> =>
  Layer.succeed(TrustedSession)({
    ...session,
    readableAccountIds: new Set(session.readableAccountIds),
    mutableAccountIds: new Set(session.mutableAccountIds),
  })
