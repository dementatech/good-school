import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface DetailField {
  label: string;
  value: React.ReactNode;
}

// Generic read-only "View" dialog — every table's View action opens one of
// these with whatever fields make sense for that row. No data fetching: the
// row's already-loaded object is all it ever shows.
export function RowDetailsDialog({
  open,
  onOpenChange,
  title,
  fields,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fields: DetailField[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
          {fields.map((field) => (
            <div key={field.label} className="contents">
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className="text-right font-medium break-words">{field.value ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
