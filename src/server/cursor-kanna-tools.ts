import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { homedir, platform } from "node:os"
import path from "node:path"
import { ALL_KANNA_TOOLS, type KannaToolHost } from "./kanna-tools"
import { createKannaMcpServer } from "./kanna-mcp"

export async function createCursorKannaTools(host: KannaToolHost) {
  const home = homedir()
  const cacheRoot = process.env.XDG_CACHE_HOME
    ?? (platform() === "darwin"
      ? path.join(home, "Library", "Caches")
      : platform() === "win32"
        ? process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local")
        : path.join(home, ".cache"))
  const pluginRoot = path.join(cacheRoot, "kanna", "cursor-plugins")
  await mkdir(pluginRoot, { recursive: true, mode: 0o700 })
  const directory = await mkdtemp(path.join(pluginRoot, "plugin-"))
  const server = createKannaMcpServer(host, ALL_KANNA_TOOLS)
  const close = () => {
    server.close()
    void rm(directory, { recursive: true, force: true }).catch(() => {})
  }
  try {
    // A private plugin binds this process to this chat without changing project MCP settings.
    await mkdir(path.join(directory, ".cursor-plugin"))
    await writeFile(path.join(directory, ".cursor-plugin/plugin.json"), JSON.stringify({
      name: "kanna-tools",
      version: "1.0.0",
      description: "Tools for the current Kanna chat.",
      mcpServers: "mcp.json",
    }))
    await writeFile(path.join(directory, "mcp.json"), JSON.stringify({
      mcpServers: {
        kanna: { url: server.url, headers: server.headers },
      },
    }), { mode: 0o600 })
    return { directory, close }
  } catch (error) {
    close()
    throw error
  }
}
