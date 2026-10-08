/** Packaged skills in the desktop Minimal composition, through its shipped YAML. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished, vi } from 'vitest'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import AgentPreset from '@deepseek-ai/dsh-agent-preset'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as SkillFilesystem from '@deepseek-ai/dsh-skill-filesystem'
import * as ToolSkill from '@deepseek-ai/dsh-tool-skill'
import { agentOn, harness } from '../../../preset/agent-preset-registry/tests/harness.ts'

it.each([false, true])('mounts desktop-only packaged skills when desktop launch is %s', async (desktop) => {
  const dir = mkdtempSync(join(tmpdir(), 'insight-minimal-'))
  onTestFinished(() => { rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs() })
  const bundle = join(dir, 'bundled-skills')
  mkdirSync(join(bundle, 'packaged-skill'), { recursive: true })
  mkdirSync(join(dir, '.agents', 'skills', 'project-skill'), { recursive: true })
  for (const [path, name] of [[join(bundle, 'packaged-skill'), 'packaged-skill'], [join(dir, '.agents', 'skills', 'project-skill'), 'project-skill']]) {
    writeFileSync(join(path!, 'SKILL.md'), `---\nname: ${name}\ndescription: Fixture skill.\n---\nUse the fixture skill.\n`)
  }
  vi.stubEnv('INSIGHT_DESKTOP_SERVICE_ENVIRONMENT', desktop ? 'test' : '')
  vi.stubEnv('DSH_BUNDLED_SKILL_DIR', bundle)
  const ctx = await harness()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(SkillRegistry)
  ctx.loader.builtins.preset = AgentPreset
  ctx.loader.builtins['skill-filesystem'] = SkillFilesystem
  ctx.loader.builtins['tool-skill'] = ToolSkill
  const [row] = loadOverlayPatches('minimal-desktop', fileURLToPath(new URL('../presets/minimal.patch.yml', import.meta.url)))
    .flatMap(patch => patch.insert ?? [])
  const config = row!.config as { id: string; plugins: { id: string; name: string }[] }
  const plugins = config.plugins.filter(plugin => ['skill-filesystem', 'tool-skill'].includes(plugin.id))
    .map(plugin => ({ ...plugin, name: `cordis:${plugin.id}` }))
  await ctx.loader.root.update([{ ...row!, name: 'cordis:preset', config: { ...config, plugins } }])
  await ctx.loader.await()
  const agent = await agentOn(ctx, `minimal-${desktop}`, 'minimal')
  expect(ctx.tools.schemas(agent).map(tool => tool.name)).toEqual(desktop ? ['skill'] : [])
  const skills = await ctx.skills.list({ cwd: dir, scope: agent })
  expect(skills.map(skill => ({ name: skill.name, source: skill.source }))).toEqual(
    desktop ? [{ name: 'packaged-skill', source: 'bundled' }] : [],
  )
})
