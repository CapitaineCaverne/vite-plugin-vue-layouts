import { resolve } from 'path'
import type { ModuleNode, Plugin, ResolvedConfig } from 'vite'
import { ResolvedOptions, UserOptions, FileContainer } from './types'
import { getFilesFromPath } from './files'
import { debug, normalizePath } from './utils'
import getClientCode from './RouteLayout'
import { getImportCode } from './importCode'

const MODULE_IDS = ['layouts-generated', 'virtual:generated-layouts']
const MODULE_ID_VIRTUAL = '/@vite-plugin-vue-layouts/generated-layouts'

export function defaultImportMode(name: string) {
  if (process.env.VITE_SSG)
    return 'sync'
  return name === 'default' ? 'sync' : 'async'
}

function resolveOptions(userOptions: UserOptions): ResolvedOptions {
  return Object.assign(
    {
      defaultLayout: 'default',
      layoutsDirs: 'src/layouts',
      pagesDir: null,
      extensions: ['vue'],
      exclude: [],
      importMode: defaultImportMode,
    },
    userOptions,
  )
}

function layoutPlugin(userOptions: UserOptions = {}): Plugin {
  let config: ResolvedConfig

  const options: ResolvedOptions = resolveOptions(userOptions)

  return {
    name: 'vite-plugin-vue-layouts',
    enforce: 'pre',
    configResolved(_config) {
      config = _config
    },
    configureServer({ moduleGraph, watcher, ws }) {
      watcher.add(options.layoutsDirs)

      const reloadModule = (module: ModuleNode | undefined, path = '*') => {
        if (module) {
          moduleGraph.invalidateModule(module)
          if (ws) {
            ws.send({
              path,
              type: 'full-reload',
            })
          }
        }
      }

      const absolutePagesDir = options.pagesDir ? normalizePath(resolve(process.cwd(), options.pagesDir)) : null

      const updateVirtualModule = (path: string) => {
        path = `${normalizePath(path)}`

        // If absolutePagesDir is defined and path doesn't correspond to pagesDir
        if (absolutePagesDir && !~path.indexOf(absolutePagesDir))
          return

        const module = moduleGraph.getModuleById(MODULE_ID_VIRTUAL)
        reloadModule(module)
      }

      watcher.on('add', (path) => {
        updateVirtualModule(path)
      })

      watcher.on('unlink', (path) => {
        updateVirtualModule(path)
      })

      watcher.on('change', async(path) => {
        path = `/${normalizePath(path)}`
        const module = await moduleGraph.getModuleByUrl(path)
        reloadModule(module, path)
      })
    },
    resolveId(id) {
      return MODULE_IDS.includes(id) || MODULE_IDS.some(i => id.startsWith(i))
        ? MODULE_ID_VIRTUAL
        : null
    },
    async load(id) {
      if (id === MODULE_ID_VIRTUAL) {
        const layoutDirs = Array.isArray(options.layoutsDirs) ? options.layoutsDirs : [options.layoutsDirs]
        const container: FileContainer[] = []

        for (const dir of layoutDirs) {
          const layoutsDirPath = dir.substr(0, 1) === '/' ? normalizePath(dir) : normalizePath(resolve(config.root, dir))

          debug('Loading Layout Dir: %O', layoutsDirPath)

          const _f = await getFilesFromPath(layoutsDirPath, options)
          container.push({ path: layoutsDirPath, files: _f })
        }

        const importCode = getImportCode(container, options)

        const clientCode = getClientCode(importCode, options)

        debug('Client code: %O', clientCode)
        return clientCode
      }
    },
  }
}

export * from './types'
export default layoutPlugin
