import { useMemo, useRef, useState } from 'react'
import './App.css'
import catalogData from './generated/templateCatalog.json'
import { createSdkContext } from './services/sdkContext'
import { ProvisioningEngine } from './services/provisioning/ProvisioningEngine'
import { getTemplateManifest } from './services/TemplateAssetLoader'
import type {
  CatalogGroup,
  CatalogTemplate,
  ProvisioningEvent,
} from './types'

const groups = catalogData.GroupwiseTemplates as CatalogGroup[]

function App() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CatalogTemplate | null>(null)
  const [projectName, setProjectName] = useState('')
  const [parameters, setParameters] = useState<Record<string, string>>({})
  const [events, setEvents] = useState<ProvisioningEvent[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const abortController = useRef<AbortController | null>(null)

  const templates = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return groups.flatMap((group) =>
      group.Template
        .filter((template) => {
          if (!normalizedQuery) return true
          return [
            template.Name,
            template.Description,
            ...(template.Tags ?? []),
          ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
        })
        .map((template) => ({ ...template, group: group.Groups })),
    )
  }, [query])

  async function provision() {
    if (!selected || !projectName.trim()) return

    setRunning(true)
    setError('')
    setEvents([])
    abortController.current = new AbortController()

    try {
      const context = await createSdkContext()
      const engine = new ProvisioningEngine(context, (event) => {
        setEvents((current) => [...current, event])
      })
      await engine.provision({
        projectName: projectName.trim(),
        template: selected,
        parameters,
      }, abortController.current.signal)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Provisioning failed.')
    } finally {
      abortController.current = null
      setRunning(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Azure DevOps</p>
          <h1>Template projects</h1>
          <p className="subtitle">
            Create a proof-of-concept project from a bundled template.
          </p>
        </div>
        <div className="session-warning">
          Keep this page open until provisioning completes.
        </div>
      </header>

      <section className="workspace">
        <aside className="catalog-panel">
          <label htmlFor="template-search">Find a template</label>
          <input
            id="template-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, description, or tag"
          />
          <div className="template-count">{templates.length} templates</div>
          <div className="template-list">
            {templates.map((template) => (
              <button
                className={selected?.Key === template.Key ? 'template-card selected' : 'template-card'}
                key={template.Key}
                onClick={() => {
                  setSelected(template)
                  setParameters({})
                }}
                type="button"
              >
                <span className="template-group">{template.group}</span>
                <strong>{template.Name}</strong>
                <span>{template.Description}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="details-panel">
          {selected ? (
            <>
              <div className="details-heading">
                <div>
                  <p className="eyebrow">{selected.group}</p>
                  <h2>{selected.Name}</h2>
                </div>
                <span className="author">{selected.Author}</span>
              </div>
              <p>{selected.Description}</p>
              <div className="tags">
                {(selected.Tags ?? []).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className="capabilities">
                <strong>Template contents</strong>
                <p>
                  {getTemplateManifest(selected.TemplateFolder).capabilities.join(', ')}
                </p>
                {getTemplateManifest(selected.TemplateFolder).files.includes('Extensions.json') && (
                  <p className="prerequisite">
                    This template requires Marketplace extensions. Install and accept their
                    terms before provisioning.
                  </p>
                )}
              </div>

              <div className="provision-form">
                <label htmlFor="project-name">New project name</label>
                <input
                  id="project-name"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  disabled={running}
                  maxLength={64}
                />
                {getTemplateManifest(selected.TemplateFolder).requiredParameters.map(
                  (parameter) => (
                    <div className="parameter-field" key={parameter.name}>
                      <label htmlFor={`parameter-${parameter.name}`}>
                        {parameter.name}
                      </label>
                      <input
                        id={`parameter-${parameter.name}`}
                        type={parameter.secret ? 'password' : 'text'}
                        value={parameters[parameter.name] ?? ''}
                        onChange={(event) =>
                          setParameters((current) => ({
                            ...current,
                            [parameter.name]: event.target.value,
                          }))
                        }
                        disabled={running}
                        autoComplete="off"
                      />
                    </div>
                  ),
                )}
                <button
                  className="primary-button"
                  type="button"
                  disabled={
                    running ||
                    !projectName.trim() ||
                    getTemplateManifest(selected.TemplateFolder).requiredParameters.some(
                      (parameter) => !(parameters[parameter.name] ?? '').trim(),
                    )
                  }
                  onClick={() => void provision()}
                >
                  {running ? 'Provisioning...' : 'Create project'}
                </button>
                {running && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => abortController.current?.abort()}
                  >
                    Cancel
                  </button>
                )}
              </div>

              {(events.length > 0 || error) && (
                <div className="progress" aria-live="polite">
                  <h3>Provisioning progress</h3>
                  {events.map((event, index) => (
                    <div className={`progress-row ${event.status}`} key={`${event.stepId}-${index}`}>
                      <span>{event.status}</span>
                      <div>
                        <strong>{event.label}</strong>
                        {event.message && <p>{event.message}</p>}
                      </div>
                    </div>
                  ))}
                  {error && <div className="error-banner">{error}</div>}
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <h2>Select a template</h2>
              <p>Review its contents and prerequisites before creating a project.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  )
}

export default App
