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
| `MetricGrid`, `MetricCard` | Headline numbers, at most four. |
| `Panel` | Any other block of content. It has the loading and empty states built in. |
| `ClassBarChart` | One series of bars with a tooltip. |

## Rules

- Show real data only. If an endpoint doesn't exist yet, leave the part out.
- Use theme colours (`bg-card`, `text-muted-foreground`, `primary-*`), never raw hex, so a school's brand colour applies.
- In shadcn components, `accent` means a hover surface. In this app it means gold, so components in `kit` use `muted` instead. Replace it again after adding a new component.
- `components/kit` is separate from `components/ui` because `card.tsx` and `Card.tsx` are the same file on macOS.
