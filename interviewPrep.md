
## 17. Interview Preparation: How to Explain This Project

**30-Second Explanation:**
"I built a secure authentication platform using Node.js, Express, and PostgreSQL. It features registration, login, and protected file access. I focused heavily on security, implementing server-side session management to allow instant revocation, storing session IDs in HttpOnly cookies to prevent XSS, and strictly enforcing database-level ownership checks to prevent IDOR vulnerabilities."

**1-Minute Explanation:**
"This project is a REST API built with Node, Express, and PostgreSQL that provides secure authentication and file access. Instead of using standard JWTs, I implemented stateful server-side sessions mapped to a PostgreSQL database. This allows for absolute session control, meaning when a user logs out, their session is instantly revoked at the database level. I also secured the application against common OWASP vulnerabilities. I prevented SQL injection using parameterized queries, prevented XSS using HttpOnly cookies, and prevented IDOR by ensuring every database query explicitly checks if the authenticated user owns the resource they are requesting."

**2-Minute Technical Explanation:**
"I developed a secure authentication and authorization backend using Node.js and PostgreSQL, architected with a strict separation of concerns—Routes, Controllers, and Services. 
For authentication, passwords are mathematically hashed with bcrypt. Upon login, I generate a cryptographically secure random session ID, hash it using SHA-256, and store it in PostgreSQL, while returning the raw ID to the client via an HttpOnly, SameSite cookie. This mitigates XSS and CSRF while protecting the database if it’s ever compromised.
For authorization, I built custom middleware that validates the cookie against the database on protected routes, attaching the verified user object to the request. In the Service layer, I prevented Insecure Direct Object References (IDOR) by hardcoding ownership checks directly into the SQL queries—e.g., `WHERE file_id = $1 AND user_id = $2`. 
To ensure reliability, I implemented IP and account-based rate limiting to thwart brute-force attacks, configured Helmet for security headers, and wrote automated integration tests using Jest and Supertest to validate both the happy paths and the security boundaries."

---

## 18. Interview Questions & Answers

**1. Why did you choose this tech stack?**
*Answer:* I chose Node.js and Express for their lightweight, non-blocking nature which handles I/O operations (like database queries) efficiently. I chose PostgreSQL because authentication involves highly relational data (Users own Sessions, Users own Files), and foreign key constraints enforce strict data integrity.

**2. Explain your architecture.**
*Answer:* I used a 3-layer architecture. Requests hit the Express Router, which passes them to Controllers. Controllers handle HTTP parsing and validation, then pass data to Services. Services contain the core business logic and execute parameterized SQL queries against the PostgreSQL database. This separation makes unit testing incredibly straightforward.

**3. Why did you choose Server-Side Sessions over JWTs?**
*Answer:* The core requirement was security and the ability to instantly revoke a session (e.g., upon logout). JWTs are stateless and cannot be revoked without implementing a complex Redis blocklist. DB-backed sessions let me instantly lock an account by setting `revoked_at = NOW()`.

**4. How does data flow through the application during a file request?**
*Answer:* The browser sends a GET request with an HttpOnly cookie. The Auth Middleware extracts the session ID, validates it against the DB, and attaches the user ID to the request. The Controller takes the requested file ID and calls the Service. The Service executes a SQL query fetching the file *only* if the file ID and user ID match. The result is returned to the client.

**5. How did you handle errors?**
*Answer:* I implemented a centralized Express error-handling middleware. If a service throws an error (e.g., "File not found"), the controller passes it to `next(err)`. The global handler catches it, logs it (hiding stack traces in production), and sends a standardized JSON response to the client.

**6. What was your biggest technical challenge?**
*Answer:* Configuring CORS properly with cookies. I learned that you cannot use a wildcard `*` for the origin if you want to send cookies; you must specify the exact origin and set `credentials: true` on both the backend CORS config and the frontend `fetch` request.

**7. How did you optimize performance?**
*Answer:* Because the `sessions` table is queried on every single protected request, I placed a database index on the `token_hash` column. This turns a slow sequential scan into an `O(log N)` index lookup.

**8. What security measures did you implement?**
*Answer:* bcrypt for passwords, parameterized SQL for injection prevention, HttpOnly cookies for XSS protection, SameSite attributes for CSRF mitigation, IDOR checks in SQL, and rate limiting to prevent brute forcing.

**9. Explain the most difficult part of the code to write.**
*Answer:* The authentication middleware and session generation. It required generating a secure token, hashing it for DB storage (in case the DB leaks), sending the unhashed version to the client in a secure cookie, and writing the logic to correlate them cleanly on subsequent requests.

**10. What happens when something fails?**
*Answer:* For unexpected server errors, the system catches the exception, logs it securely (without exposing sensitive tokens or DB credentials), and returns a generic 500 error to the client to avoid leaking infrastructure details.

**11. What would you change if the application had 1 million users?**
*Answer:* Querying PostgreSQL on every single API request to validate a session would create a bottleneck. I would introduce Redis as an in-memory caching layer for the `sessions` table to achieve sub-millisecond session validation.

**12. What would you improve if you had more time?**
*Answer:* I would implement a refresh-token rotation system or sliding session expirations. I would also add email verification during registration and a secure password reset flow.

**13. What alternatives did you consider for rate limiting?**
*Answer:* I considered using Redis for rate limiting, but to keep the architecture simple and dependency-free for this iteration, I used `express-rate-limit` for IP tracking in memory, and the PostgreSQL database for tracking specific account login failures.

**14. How did you prevent SQL Injection?**
*Answer:* By exclusively using the `pg` library's parameterized queries (e.g., `query('SELECT * FROM users WHERE email = $1', [email])`). I never concatenated user input into SQL strings.

**15. How do you prevent Insecure Direct Object References (IDOR)?**
*Answer:* I never trust user input regarding ownership. Whenever a user requests a resource by ID, the SQL query explicitly includes `AND user_id = $2`, using the user ID derived securely from their session, not from the request body.

**16. Why hash session tokens in the database?**
*Answer:* If an attacker steals a backup of the PostgreSQL database, they would have the active session IDs and could hijack user accounts. By storing a SHA-256 hash of the session ID, the stolen database becomes useless for session hijacking.

**17. What is CORS and how did you configure it?**
*Answer:* Cross-Origin Resource Sharing is a browser security mechanism. Since my frontend runs on port 5500 and backend on 3000, they are different origins. I configured the backend to explicitly allow requests from `http://localhost:5500` and permitted credentials.

**18. What does Helmet.js do?**
*Answer:* It's a collection of middleware that sets secure HTTP response headers, such as `X-Content-Type-Options: nosniff` (prevents MIME sniffing) and `Strict-Transport-Security` (enforces HTTPS).

**19. How do you ensure environment variables aren't leaked?**
*Answer:* I used the `dotenv` package to load variables from a `.env` file, which is strictly included in my `.gitignore`. I provided a `.env.example` file with dummy values for other developers.

**20. Explain the difference between Authentication and Authorization in your app.**
*Answer:* Authentication proves *who* the user is (verifying email/password and issuing a session). Authorization determines *what* they can do (validating they actually own the file they are trying to download).

---

## 19. Important Concepts I Must Know (Interview Checklist)
- [ ] **Stateful vs Stateless Auth:** Know the pros/cons of Session Cookies vs JWTs.
- [ ] **XSS (Cross-Site Scripting):** Understand how it works and how `HttpOnly` stops it.
- [ ] **CSRF (Cross-Site Request Forgery):** Understand it and how `SameSite` cookies mitigate it.
- [ ] **SQL Injection:** Know what it looks like and how parameterization solves it.
- [ ] **IDOR (Insecure Direct Object Reference):** Know how to explain preventing it via backend ownership checks.
- [ ] **Hashing vs Encryption:** Know why we hash passwords (one-way) instead of encrypting them (two-way).
- [ ] **CORS:** Be able to explain Origins and Preflight (`OPTIONS`) requests.
- [ ] **Database Indexing:** Understand how a B-Tree index speeds up lookups on tables like `sessions`.


### Final Interview Cheat Sheet
1. **The Core Stack:** Node.js, Express, PostgreSQL.
2. **The Core Feature:** Highly secure, DB-backed session authentication with true server-side logout.
3. **Password Security:** `bcrypt`, cost factor 12.
4. **Token Security:** Hashed in DB, stored in client via `HttpOnly`, `SameSite` cookies.
5. **IDOR Prevention:** Always append `AND user_id = req.user.id` to database queries.
6. **SQLi Prevention:** Always use parameterized queries (`$1, $2`).
7. **XSS Prevention:** No `localStorage` for sensitive tokens.
8. **Rate Limiting:** IP-level for DDoS, Account-level for brute-force.
9. **Architecture:** Separation of concerns (Routes -> Controllers -> Services).
10. **Scalability consideration:** Database indexes on tokens/emails, prepare to use Redis for sessions.
