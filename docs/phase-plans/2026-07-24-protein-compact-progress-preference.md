# Protein Tracker compact-progress preference

## Scope

Add a persisted `compact_progress` preference for Protein Tracker. Compact is
the default and hides the visual range labels on the Today target panel.

## Migration order

1. Add `protein_preferences.compact_progress boolean not null default true`.
2. Grant the authenticated role insert and update access to the new column.
3. Apply the migration to the verified `gsiyqhkcgegjrvqcqioc` Supabase project
   before deploying the application code that reads it.

## Risks and rollback

The change adds a non-sensitive user preference and does not affect tournament
state. Existing rows receive `true`. Rollback is application-level: render the
Standard layout while leaving the preference column in place; do not drop user
preference data.

## Validation

Run the Protein Tracker focused setting, Today, and progress tests. Verify the
remote migration is recorded and the column is present before deployment.
