import { switchTargetLabel, type SwitchTarget } from "../domain/account-switch.js";

export interface SwitchPickerUi {
  select(title: string, options: string[]): Promise<string | undefined>;
}

/** Let the user pick a switch target; returns undefined when cancelled. */
export async function pickSwitchTarget(
  ui: SwitchPickerUi,
  targets: SwitchTarget[],
): Promise<SwitchTarget | undefined> {
  const labels = targets.map(switchTargetLabel);
  const selected = await ui.select("Switch to which provider?", labels);
  if (!selected) return undefined;
  return targets[labels.indexOf(selected)];
}
