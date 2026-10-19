let supported: boolean | undefined;

/**
 * Whether this browser can run the game's renderers: Pixi with GLSL 300 es shaders, so WebGL2.
 * Software WebGL counts (headless Chromium's SwiftShader, which the screenshot tools use): slow
 * beats unplayable. Checked once; the test context is released straight away.
 */
export function hasWebGL2(): boolean {
  if (supported === undefined) {
    try {
      const gl = document.createElement("canvas").getContext("webgl2");
      supported = !!gl;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      supported = false;
    }
  }
  return supported;
}
