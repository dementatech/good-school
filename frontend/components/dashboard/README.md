# Dashboard kit

Every portal's frame and dashboard are built from these parts, so they stay uniform. Don't style a dashboard by hand.

## Layers

| Layer | Folder | What's there |
|---|---|---|
| Primitives | `components/kit` | shadcn/ui (Radix) components, added with `npx shadcn@latest add <name>`. |
| Dashboard parts | `components/dashboard` | The pieces below, built only from those primitives. |
| Pages | `app/<portal>/page.tsx` | Fetch data and arrange parts. No custom surfaces. |

## Parts

| Part | Use it for |
|---|---|
| `PortalShell` | The frame of a portal. A portal supplies its navigation and nothing else. |
| `DashboardPage`, `DashboardColumns` | Page width and the two-column layout. |
| `NoticeBanner` | The single most urgent thing today. Leave it out when nothing is urgent. |
| `MetricGrid`, `MetricCard` | Headline numbers, at most four. `tone` colours the icon tile; `success` and `warning` are for reporting a state only. |
| `DashboardFeatureRow`, `DashboardChartRow` | A feature block beside a narrower panel, and a row of three charts. |
| `FeaturePanel` | The one navy block a page leads with. At most one per page. |
| `Panel` | Any other block of content. It has the loading and empty states built in. |
| `ClassBarChart` | One series of bars with a tooltip. |
| `StackedColumnChart` | Totals split into series, on a `FeaturePanel`. |
| `DonutChart` | One whole split into a few parts, such as gender. Not for comparing close values. |
| `RankedBars` | Percentages, worst first, flagging anything under a target. |
| `TrendLine` | One percentage over time. |
| `ComingUpPanel`, `EventsCalendar` | The next few events, and the month view its link opens. Each portal has a thin `calendar/page.tsx`; pass `manageHref` where the viewer can manage events. |

## Rules

- Show real data only. If an endpoint doesn't exist yet, leave the part out.
- Don't invent trends. A "+12%" needs a real earlier value from an endpoint; without one, leave it out.
- Draw charts with D3 (named imports from `d3`), and pass them memoised data so they only redraw when it changes.
- Keep a colour on the same thing everywhere: boys are blue and girls are orange in every chart.
- Use theme colours (`bg-card`, `text-muted-foreground`, `primary-*`), never raw hex, so a school's brand colour applies.
- In shadcn components, `accent` means a hover surface. In this app it means orange, so components in `kit` use `muted` instead. Replace it again after adding a new component.
- `components/kit` is separate from `components/ui` because `card.tsx` and `Card.tsx` are the same file on macOS.
