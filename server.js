#!/usr/bin/env node
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import readline from "node:readline";
import path from "node:path";
import process from "node:process";

const registryUrl = process.env.REGISTRY_URL ?? "";

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  let request;
  try {
    request = JSON.parse(trimmed);
  } catch (error) {
    respond({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" }
    });
    return;
  }

  const { id, method, params } = request;
  try {
    const result = await handleMethod(method, params ?? {});
    respond({ jsonrpc: "2.0", id, result });
  } catch (error) {
    respond({
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: error instanceof Error ? error.message : String(error) }
    });
  }
});

function respond(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function handleMethod(method, params) {
  switch (method) {
    case "initialize":
      return { protocolVersion: "2024-11-05", server: "codex-skills-mcp" };
    case "skills.search":
      return skillsSearch(params);
    case "skills.get":
      return skillsGet(params);
    case "skills.install":
      return skillsInstall(params);
    case "skills.verify":
      return skillsVerify(params);
    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

async function skillsSearch(params) {
  const index = await loadIndex();
  const query = (params.query ?? "").toLowerCase();
  const tags = Array.isArray(params.tags) ? params.tags.map((tag) => tag.toLowerCase()) : [];

  return index.skills
    .filter((skill) => {
      if (query) {
        const haystack = [skill.name, skill.description ?? "", ...(skill.tags ?? [])]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }
      if (tags.length) {
        const skillTags = (skill.tags ?? []).map((tag) => tag.toLowerCase());
        return tags.every((tag) => skillTags.includes(tag));
      }
      return true;
    })
    .map((skill) => ({
      name: skill.name,
      version: skill.latest,
      description: skill.description
    }));
}

async function skillsGet(params) {
  if (!params.name) {
    throw new Error("Missing name");
  }
  const index = await loadIndex();
  const skill = findSkill(index, params.name);
  return loadJson(resolveRelativeSource(index.__source, skill.manifest));
}

async function skillsInstall(params) {
  if (!params.name) {
    throw new Error("Missing name");
  }
  const index = await loadIndex();
  const skill = findSkill(index, params.name);
  const manifest = await loadJson(resolveRelativeSource(index.__source, skill.manifest));
  const version = params.version ?? skill.latest;
  const entry = manifest.versions.find((item) => item.version === version);
  const artifact = entry?.artifact ?? skill.artifact;
  if (!artifact?.url) {
    throw new Error("Artifact not found");
  }
  return {
    artifactUrl: resolveRelativeSource(index.__source, artifact.url),
    sha256: artifact.sha256,
    entry: artifact.entry
  };
}

async function skillsVerify(params) {
  if (!params.artifactUrl || !params.sha256) {
    throw new Error("Missing artifactUrl or sha256");
  }
  const buffer = await loadBinary(params.artifactUrl);
  const digest = sha256(buffer);
  return { ok: digest === params.sha256, sha256: digest };
}

async function loadIndex() {
  const source = registryUrl || process.env.CodexRegistry || "";
  if (!source) {
    throw new Error("REGISTRY_URL is not set");
  }
  const index = await loadJson(source);
  index.__source = source;
  return index;
}

function findSkill(index, name) {
  const normalized = name.trim().toLowerCase();
  const skill = index.skills.find((entry) => entry.name.toLowerCase() === normalized);
  if (!skill) {
    throw new Error(`Skill not found: ${name}`);
  }
  return skill;
}

function resolveRelativeSource(base, relativePath) {
  if (isHttp(relativePath) || relativePath.startsWith("file://")) {
    return relativePath;
  }
  if (isHttp(base)) {
    return new URL(relativePath, base).toString();
  }
  if (base.startsWith("file://")) {
    const basePath = new URL(base).pathname;
    return path.resolve(path.dirname(basePath), relativePath);
  }
  return path.resolve(path.dirname(base), relativePath);
}

async function loadJson(source) {
  if (isHttp(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${source}: ${response.status}`);
    }
    return response.json();
  }
  const filePath = source.startsWith("file://") ? new URL(source).pathname : source;
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

async function loadBinary(source) {
  if (isHttp(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${source}: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  const filePath = source.startsWith("file://") ? new URL(source).pathname : source;
  return fs.readFile(filePath);
}

function isHttp(value) {
  return value.startsWith("http://") || value.startsWith("https://");
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
