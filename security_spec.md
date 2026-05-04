# Security Specification: AI Insight Reader

## Data Invariants
- A `Book` cannot be created without a `userId` matching the authenticated user.
- A `ReadingProgress` record must link to a valid `Book` and belong to the same `userId`.
- `ChatSession` messages are immutable in history but the session can be appended to.
- Content size is bounded but allows for long texts (up to Firestore limits).

## The Dirty Dozen Payloads (Attack Vectors)

1. **Identity Spoofing**: Attempt to create a book with someone else's `userId`.
2. **Access Escalation**: Attempt to read a book document where `userId` doesn't match the current user.
3. **ID Poisoning**: Use a 2KB string as a document ID.
4. **Shadow Update**: Attempt to update a book and inject a `isFeatured: true` field.
5. **State Shortcut**: Update `currentPage` to a negative number or a non-integer.
6. **PII Leak**: Attempt to list all books without a `where` clause (rejected by rules).
7. **Resource Exhaustion**: Send a chat message that is 1MB in size.
8. **Orphaned Writes**: Create a progress record for a non-existent book ID (not fully preventable without `exists()`, but we enforce `bookId` presence).
9. **Timestamp Spoofing**: Provide a future/past `createdAt` (should ideally use server timestamp).
10. **Global Scraping**: Attempt to list `/books` as an unauthenticated user.
11. **Action Bypass**: Update a book's `content` when only permitted fields should change (rules restrict to specific keys).
12. **Recursive Cost Attack**: Trigger massive `get()` lookups (not present in current rules structure).

## Verification Strategy
- We will use `DRAFT_firestore.rules` and verify them manually against these vectors.
- The `isValidBook` helper ensures strict key matching.
