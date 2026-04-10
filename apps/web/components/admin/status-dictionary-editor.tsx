'use client';

import { Badge } from '@fmksa/ui/components/badge';
import { Button } from '@fmksa/ui/components/button';
import { Input } from '@fmksa/ui/components/input';
import { Label } from '@fmksa/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fmksa/ui/components/select';
import { useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@/lib/trpc-client';

// ---------------------------------------------------------------------------
// Known dictionary codes
// ---------------------------------------------------------------------------

const DICTIONARY_CODES = [
  { value: 'project_status', label: 'Project Status' },
  { value: 'document_status', label: 'Document Status' },
  { value: 'material_status', label: 'Material Status' },
  { value: 'workflow_step_status', label: 'Workflow Step Status' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatusDictionaryEditor() {
  const [selectedDict, setSelectedDict] = useState('');

  const { data: entries, isLoading } = trpc.referenceData.statusDicts.get.useQuery(
    { dictionaryCode: selectedDict },
    { enabled: !!selectedDict },
  );

  return (
    <div className="space-y-4">
      {/* Dictionary selector */}
      <div className="space-y-2">
        <Label>Dictionary Code</Label>
        <Select value={selectedDict} onValueChange={setSelectedDict}>
          <SelectTrigger className="max-w-sm">
            <SelectValue placeholder="Select a status dictionary..." />
          </SelectTrigger>
          <SelectContent>
            {DICTIONARY_CODES.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Entries table */}
      {selectedDict && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status Code</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Label</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Order</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Color</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Terminal</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Loading entries...
                  </td>
                </tr>
              ) : !entries || entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No entries in this dictionary. Add entries via the reference data API.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <StatusEntryRow key={entry.id} entry={entry} />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!selectedDict && (
        <p className="text-sm text-muted-foreground">
          Select a dictionary to view and edit its status entries.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editable row
// ---------------------------------------------------------------------------

function StatusEntryRow({
  entry,
}: {
  entry: {
    id: string;
    statusCode: string;
    label: string;
    orderIndex: number;
    colorHint: string | null;
    isTerminal: boolean;
  };
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(entry.label);
  const [order, setOrder] = useState(entry.orderIndex);
  const [color, setColor] = useState(entry.colorHint ?? '');
  const [terminal, setTerminal] = useState(entry.isTerminal);

  const utils = trpc.useUtils();
  const updateMutation = trpc.referenceData.statusDicts.update.useMutation({
    onSuccess: () => {
      toast.success(`Status "${entry.statusCode}" updated.`);
      utils.referenceData.statusDicts.get.invalidate();
      setEditing(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (!editing) {
    return (
      <tr
        className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => setEditing(true)}
      >
        <td className="px-4 py-2 font-mono text-xs">{entry.statusCode}</td>
        <td className="px-4 py-2">{entry.label}</td>
        <td className="px-4 py-2 text-center">{entry.orderIndex}</td>
        <td className="px-4 py-2 text-center">
          {entry.colorHint ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-3 w-3 rounded-full border"
                style={{ backgroundColor: entry.colorHint }}
              />
              <span className="text-xs text-muted-foreground">{entry.colorHint}</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </td>
        <td className="px-4 py-2 text-center">
          {entry.isTerminal ? (
            <Badge variant="secondary" className="text-xs">Yes</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">No</span>
          )}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b last:border-0 bg-muted/20">
      <td className="px-4 py-2 font-mono text-xs">{entry.statusCode}</td>
      <td className="px-4 py-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-8 text-sm"
        />
      </td>
      <td className="px-4 py-2">
        <Input
          type="number"
          value={order}
          onChange={(e) => setOrder(Number(e.target.value))}
          className="h-8 text-sm w-20 mx-auto"
        />
      </td>
      <td className="px-4 py-2">
        <Input
          value={color}
          onChange={(e) => setColor(e.target.value)}
          placeholder="#hex"
          className="h-8 text-sm w-24 mx-auto"
        />
      </td>
      <td className="px-4 py-2 text-center">
        <label className="flex items-center justify-center gap-1">
          <input
            type="checkbox"
            checked={terminal}
            onChange={(e) => setTerminal(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
        </label>
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              updateMutation.mutate({
                id: entry.id,
                label,
                orderIndex: order,
                colorHint: color || null,
                isTerminal: terminal,
              });
            }}
            disabled={updateMutation.isPending}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => {
              setLabel(entry.label);
              setOrder(entry.orderIndex);
              setColor(entry.colorHint ?? '');
              setTerminal(entry.isTerminal);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </td>
    </tr>
  );
}
