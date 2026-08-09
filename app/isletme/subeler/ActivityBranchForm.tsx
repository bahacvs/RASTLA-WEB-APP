'use client';

import { useActionState } from 'react';
import { setActivityBranchAction, type BranchState } from '@/app/actions/branch';

/**
 * Bir ilanı şubeye bağlar.
 *
 * Seçenek listesi kolaylık; şubenin bu işletmeye ait olduğu sunucuda
 * doğrulanıyor (`setActivityBranchAction`). Elle başka bir kimlik göndermek
 * işe yaramaz.
 */
export function ActivityBranchForm({
  activityId,
  branchId,
  branches,
}: {
  activityId: string;
  branchId: string | null;
  branches: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<BranchState, FormData>(
    setActivityBranchAction,
    {}
  );

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="activityId" value={activityId} />
      <label htmlFor={`branch-${activityId}`} className="sr-only">
        Şube
      </label>
      <select
        id={`branch-${activityId}`}
        name="branchId"
        defaultValue={branchId ?? ''}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-10 rounded-lg border border-outline-variant bg-surface px-2 text-body-md"
      >
        <option value="">Şubesiz</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>

      {/* JavaScript kapalıyken de değiştirilebilsin. */}
      <noscript>
        <button
          type="submit"
          className="rounded-lg border border-outline-variant px-3 py-2 text-label-bold text-on-surface-variant"
        >
          Kaydet
        </button>
      </noscript>

      {pending && <span className="text-label-sm text-on-surface-variant">…</span>}
      {state.error && <span className="text-label-sm text-error">{state.error}</span>}
    </form>
  );
}
