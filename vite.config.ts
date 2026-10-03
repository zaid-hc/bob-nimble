import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { modelLab } from './model-lab.ts'

const IDE_DB_PATH = process.env.BOB_IDE_DB_PATH || join(homedir(), '.bob', 'db', 'bob.db')

type JsonResponse = Record<string, unknown> | unknown[]

function sendJson(res: import('node:http').ServerResponse, status: number, payload: JsonResponse) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

function ideConversationBridge() {
  return {
    name: 'bob-ide-conversation-bridge',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use('/ide-api/sessions', (req, res, next) => {
        if (req.method !== 'GET') return next()
        if (!existsSync(IDE_DB_PATH)) {
          return sendJson(res, 503, { error: 'Bob IDE conversation database was not found.' })
        }

        const sessionId = decodeURIComponent((req.url || '/').replace(/^\/+/, '').split('?')[0])
        if (sessionId && !/^[a-f0-9]{32}$/.test(sessionId)) {
          return sendJson(res, 400, { error: 'Invalid IDE conversation ID.' })
        }

        const db = new DatabaseSync(IDE_DB_PATH, { readOnly: true })
        try {
          if (!sessionId) {
            const tasks = db.prepare(`
              SELECT id, project_id, title, first_message, created_at, updated_at
              FROM tasks
              WHERE parent_id IS NULL
              ORDER BY updated_at DESC
              LIMIT 100
            `).all() as Array<Record<string, string | number | null>>

            return sendJson(res, 200, tasks.map(task => ({
              id: task.id,
              title: task.title || task.first_message || 'Untitled IDE conversation',
              mode: 'agent',
              workspaceId: task.project_id,
              workspaceName: String(task.project_id || 'file:/').replace(/^file:/, '') || 'Bob Playground',
              created: task.created_at,
              updated: task.updated_at,
              preview: String(task.first_message || '').slice(0, 100),
              source: 'ide',
              readOnly: true,
            })))
          }

          const task = db.prepare(`
            SELECT id, project_id, title, first_message, created_at, updated_at
            FROM tasks
            WHERE id = ? AND parent_id IS NULL
          `).get(sessionId) as Record<string, string | number | null> | undefined

          if (!task) return sendJson(res, 404, { error: 'IDE conversation not found.' })

          const rows = db.prepare(`
            SELECT id, role, data, created_at
            FROM messages
            WHERE task_id = ? AND role IN ('user', 'assistant')
            ORDER BY created_at, id
          `).all(sessionId) as Array<Record<string, string | number>>

          const messages = rows.flatMap((row, index) => {
            try {
              const data = JSON.parse(String(row.data)) as { content?: unknown }
              const content = typeof data.content === 'string' ? data.content.trim() : ''
              if (!content) return []
              return [{
                id: Number(row.created_at) + index,
                session_id: sessionId,
                role: row.role,
                content,
                ts: row.created_at,
              }]
            } catch {
              return []
            }
          })

          return sendJson(res, 200, {
            id: task.id,
            title: task.title || task.first_message || 'Untitled IDE conversation',
            mode: 'agent',
            workspaceId: task.project_id,
            workspaceName: String(task.project_id || 'file:/').replace(/^file:/, '') || 'Bob Playground',
            created: task.created_at,
            updated: task.updated_at,
            preview: String(task.first_message || '').slice(0, 100),
            source: 'ide',
            readOnly: true,
            messages,
          })
        } catch (error) {
          return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Could not read Bob IDE conversations.' })
        } finally {
          db.close()
        }
      })
    },
  }
}

const FRONTEND_PORT = Number(process.env.PORT) || 3003;
const BACKEND_PORT  = Number(process.env.VITE_BACKEND_PORT) || 3101;

export default defineConfig({
  plugins: [react(), tailwindcss(), ideConversationBridge(), modelLab()],
  server: {
    port: FRONTEND_PORT,
    host: '127.0.0.1',
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${BACKEND_PORT}`,
        changeOrigin: true,
      },
    },
  },
})
