"""Data access: SQL and row mapping only, one module per aggregate.

Repositories hold no business rules. They are composed by the services, which own
the transaction boundary for any operation that writes more than one row.
"""
