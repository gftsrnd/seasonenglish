import { CheckCircle2, CircleAlert, Info, TimerReset } from "lucide-react";

type FeedbackTone = "success" | "error" | "warning" | "info";

/** A compact, consistent game status affordance.  Games previously used plain
 * strings (and a mixture of emoji elsewhere), which made correct/wrong state
 * look like generated text rather than an intentional E4S feedback state. */
export function GameFeedback({ message, tone = "info" }: { message: string; tone?: FeedbackTone }) {
  if (!message) return null;
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? CircleAlert : tone === "warning" ? TimerReset : Info;
  return <p className={`game-notice game-feedback is-${tone}`} aria-live="polite"><Icon className="game-feedback-icon" size={17} strokeWidth={2} aria-hidden="true" /><span>{message}</span></p>;
}
