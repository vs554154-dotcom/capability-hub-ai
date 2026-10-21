"""Business rules.

Services compose repositories, own the transaction boundary for every multi-row
write, and raise `errors.DomainError` subclasses rather than HTTP exceptions. They
know nothing about requests, sessions or status codes - that is the routers' job.
"""
