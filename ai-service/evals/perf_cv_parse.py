"""Manual measure of NFR-6: one CV parsed in under 30 s at p95 (US-2.4 AC-12).

Not run in CI. It drives the whole stack as a student would: upload a CV (`POST /api/cvs`, 202),
then poll `GET /api/cvs/me` until that version leaves "Đang phân tích". The time between the two is
what the student waits, queue included. Run it against compose with a real provider:

    # deploy/.env: LLM_PROVIDER=gemini, GEMINI_API_KEY=... (paid tier), then
    docker compose -f deploy/docker-compose.yml up -d --build --wait
    cd ai-service
    .venv/Scripts/python evals/perf_cv_parse.py --campaign 1 --count 20

The student account (default sv001@srm.local from the dev seed) must be a target of the campaign,
which must be in INTAKE. The CVs are synthetic, built here; never upload a real student's CV with
the free tier of Gemini. Each upload is a new version of the same student's CV, sent once the
previous one has settled. Per-call figures are in ai.llm_calls.latency_ms. Write the p95 in the PR.
"""

import argparse
import math
import os
import statistics
import sys
import time

import httpx
import pymupdf

SKILLS = [
    "Java",
    "Spring Boot",
    "Python",
    "Django",
    "React",
    "TypeScript",
    "PostgreSQL",
    "Docker",
    "Git",
    "Kotlin",
    "Flutter",
    "SQL",
    "Pandas",
    "Selenium",
    "Linux",
]
SETTLED = {"PENDING_CONFIRMATION", "ANALYSIS_FAILED"}


def synthetic_cv(index: int) -> bytes:
    """A one-page CV of a made-up student; Helvetica has no Vietnamese glyphs, so it is English."""
    skills = [SKILLS[(index + step * 4) % len(SKILLS)] for step in range(4)]
    lines = [
        f"DEMO STUDENT {index:03d}",
        f"Email: demo.student{index:03d}@example.com | Phone: 0900 000 {index:03d}",
        "Objective: software engineering intern.",
        "EDUCATION",
        "Demo University - B.Eng. Information Technology (2022 - present), GPA 3.1/4",
        "SKILLS",
        ", ".join(skills),
        "PROJECTS",
        f"Demo project {index} (2024): a web application built with {skills[0]} and {skills[1]}.",
        f"Team project (2025): an API in {skills[2]}, deployed with {skills[3]}.",
        "LANGUAGES",
        "English - TOEIC 600",
    ]
    document = pymupdf.open()
    page = document.new_page()
    for number, line in enumerate(lines):
        page.insert_text((60, 60 + 18 * number), line, fontsize=10)
    return document.tobytes(garbage=4, deflate=True)


def percentile(values: list[float], share: float) -> float:
    ordered = sorted(values)
    return ordered[max(math.ceil(share * len(ordered)) - 1, 0)]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--api", default="http://localhost:8080/api", help="API base URL")
    parser.add_argument("--campaign", type=int, required=True, help="campaign id, in INTAKE")
    parser.add_argument("--count", type=int, default=20)
    parser.add_argument("--email", default="sv001@srm.local")
    parser.add_argument("--password", default=os.environ.get("SEED_PASSWORD"))
    parser.add_argument("--timeout", type=float, default=120.0, help="seconds per CV")
    args = parser.parse_args()
    if not args.password:
        parser.error("--password or SEED_PASSWORD is required")

    with httpx.Client(base_url=args.api, timeout=30.0) as client:
        login = client.post("/auth/login", json={"email": args.email, "password": args.password})
        login.raise_for_status()
        client.headers["Authorization"] = f"Bearer {login.json()['accessToken']}"
        terms = client.get("/me/consents").json()["currentTermsVersion"]
        client.post(
            "/me/consents", json={"campaignId": args.campaign, "termsVersion": terms}
        ).raise_for_status()

        waits: list[float] = []
        failed = 0
        for index in range(1, args.count + 1):
            started = time.monotonic()
            upload = client.post(
                "/cvs",
                data={"campaignId": str(args.campaign)},
                files={"file": (f"cv-{index:03d}.pdf", synthetic_cv(index), "application/pdf")},
            )
            if upload.status_code != 202:
                print(f"#{index}: upload refused {upload.status_code} {upload.text}")
                return 1
            cv_id = upload.json()["id"]
            status = "PENDING_ANALYSIS"
            while status not in SETTLED:
                if time.monotonic() - started > args.timeout:
                    print(f"#{index}: cv {cv_id} still {status} after {args.timeout:.0f} s")
                    return 1
                time.sleep(0.25)
                items = client.get("/cvs/me", params={"campaignId": args.campaign}).json()["items"]
                status = next(item["status"] for item in items if item["id"] == cv_id)
            elapsed = time.monotonic() - started
            failed += status == "ANALYSIS_FAILED"
            waits.append(elapsed)
            print(f"#{index}: cv {cv_id} {status} in {elapsed:.1f} s")

    print(
        f"\n{len(waits)} CVs, {failed} failed. "
        f"p50 {statistics.median(waits):.1f} s, p95 {percentile(waits, 0.95):.1f} s, "
        f"max {max(waits):.1f} s (NFR-6: p95 < 30 s)"
    )
    return 0 if percentile(waits, 0.95) < 30 and failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
