/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import seedApplications from "../app/seed-applications.json";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/state") {
      const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
      const defaultState = {
        version: 2,
        applications: seedApplications,
        progress: {},
        settings: { startDate: new Date().toISOString().slice(0, 10), primaryLanguage: "Python 3", weeklyGoal: 7 },
      };

      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS job_hub_state (
        id TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`).run();

      if (request.method === "GET") {
        const row = await env.DB.prepare("SELECT payload, updated_at FROM job_hub_state WHERE id = ?")
          .bind("primary")
          .first<{ payload: string; updated_at: string }>();
        if (row) return new Response(JSON.stringify({ ...JSON.parse(row.payload), updatedAt: row.updated_at }), { headers });

        const now = new Date().toISOString();
        await env.DB.prepare("INSERT INTO job_hub_state (id, payload, updated_at) VALUES (?, ?, ?)")
          .bind("primary", JSON.stringify(defaultState), now)
          .run();
        return new Response(JSON.stringify({ ...defaultState, updatedAt: now }), { headers });
      }

      if (request.method === "PUT") {
        const payload = await request.json() as Record<string, unknown>;
        if (!Array.isArray(payload.applications) || !payload.progress || !payload.settings) {
          return new Response(JSON.stringify({ error: "Invalid Job Hub state." }), { status: 400, headers });
        }
        const state = {
          version: 2,
          applications: payload.applications,
          progress: payload.progress,
          settings: payload.settings,
        };
        const now = new Date().toISOString();
        await env.DB.prepare(`INSERT INTO job_hub_state (id, payload, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`)
          .bind("primary", JSON.stringify(state), now)
          .run();
        return new Response(JSON.stringify({ ok: true, updatedAt: now }), { headers });
      }

      return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers });
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
