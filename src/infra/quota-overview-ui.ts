import { Container, Key, matchesKey, Text } from "@mariozechner/pi-tui";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { Account } from "../domain/accounts.js";
import type { ProviderUsageResult } from "../domain/usage-types.js";
import { buildQuotaOverview, type QuotaOverviewItem } from "../lib/quota-overview.js";
const QUOTA_OVERVIEW_SHORTCUTS = [Key.f6] as const;

type FetchFn = () => Promise<Array<{ account: Account; result: ProviderUsageResult }>>;
type BuildFn = typeof buildQuotaOverview;

export function createQuotaOverviewWidget(
  fetchFn: FetchFn,
  buildFn: BuildFn,
) {
  // Pi SDK custom widget callback signature — types come from @mariozechner/pi-tui
  // and @mariozechner/pi-coding-agent which are runtime-only dependencies.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tui: any, theme: any, _keybindings: any, done: any) => {
    const panel = new Container();
    let closed = false;

    const addFrame = () => {
      panel.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
      panel.addChild(new Text(theme.fg("accent", theme.bold("Account quotas")), 1, 0));
    };
    const addCloseHint = () => {
      panel.addChild(new Text(
        theme.fg("dim", "F6, Esc, or Enter to close"),
        1,
        0,
      ));
      panel.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
    };
    const showLoading = () => {
      addFrame();
      panel.addChild(new Text(theme.fg("dim", "Loading account quotas…"), 1, 0));
      addCloseHint();
    };
    const showOverview = (overview: QuotaOverviewItem[]) => {
      panel.clear();
      addFrame();
      for (const item of overview) {
        panel.addChild(new Text(
          `${theme.bold(item.account)}  ${theme.fg(item.severity, item.status)}`,
          1,
          0,
        ));
      }
      addCloseHint();
    };

    showLoading();
    void fetchFn()
      .then((results) => {
        if (closed) return;
        showOverview(buildFn(results));
        tui.requestRender();
      })
      .catch((error: unknown) => {
        if (closed) return;
        showOverview([{ account: "Quota loading failed", status: error instanceof Error ? error.message : "Unknown error", severity: "error" }]);
        tui.requestRender();
      });

    return {
      render: (width: number) => panel.render(width),
      invalidate: () => panel.invalidate(),
      handleInput: (data: string) => {
        if (
          QUOTA_OVERVIEW_SHORTCUTS.some((shortcut) => matchesKey(data, shortcut))
          || matchesKey(data, Key.escape)
          || matchesKey(data, Key.enter)
        ) {
          closed = true;
          done();
        }
        tui.requestRender();
      },
    };
  };
}
