"""
One-time Supabase schema setup for the offline-first SOS feature.

The Supabase Python SDK (supabase_client.py) talks to the PostgREST API,
which cannot execute arbitrary DDL (CREATE TABLE etc) — there is no
`db_url`/psycopg dependency in this project to run schema_sos.sql directly.
So this script does the honest thing: it prints the SQL for you to paste
into the Supabase project's SQL editor (Dashboard -> SQL Editor -> New
query), rather than pretending to apply it automatically.

Run:
    python setup_supabase.py
"""

from pathlib import Path

SCHEMA_FILE = Path(__file__).parent / "schema_sos.sql"


def main() -> None:
    sql = SCHEMA_FILE.read_text(encoding="utf-8")
    print("=" * 70)
    print("Paste the following into your Supabase project's SQL Editor")
    print("(Dashboard -> SQL Editor -> New query) and run it once:")
    print("=" * 70)
    print(sql)


if __name__ == "__main__":
    main()
