import { useEffect, useRef } from 'react'

/**
 * Interactive WebGL Bayer-Dithered Fluid Noise Shader
 * Inspired by React Bits & dithercn (from webdev.teknium.io).
 * High-performance, zero external dependency WebGL shader that renders
 * a flowing noise wave with an 8x8 Bayer ordered dithering matrix in Solstice amber/cyan tones.
 */
export function DitherCanvas({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power' })
    if (!gl) return

    const vsSource = `
      attribute vec2 position;
      varying vec2 vUv;
      void main() {
        vUv = (position + 1.0) * 0.5;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `

    const fsSource = `
      precision highp float;
      varying vec2 vUv;
      uniform vec2 uResolution;
      uniform float uTime;
      uniform vec2 uMouse;

      // 8x8 Bayer Dithering Matrix
      float bayer8(vec2 p) {
        int x = int(mod(p.x, 8.0));
        int y = int(mod(p.y, 8.0));
        
        // Compact 8x8 Bayer table
        int bayer[64];
        bayer[0]=0;   bayer[1]=32;  bayer[2]=8;   bayer[3]=40;  bayer[4]=2;   bayer[5]=34;  bayer[6]=10;  bayer[7]=42;
        bayer[8]=48;  bayer[9]=16;  bayer[10]=56; bayer[11]=24; bayer[12]=50; bayer[13]=18; bayer[14]=58; bayer[15]=26;
        bayer[16]=12; bayer[17]=44; bayer[18]=4;  bayer[19]=36; bayer[20]=14; bayer[21]=46; bayer[22]=6;  bayer[23]=38;
        bayer[24]=60; bayer[25]=28; bayer[26]=52; bayer[27]=20; bayer[28]=62; bayer[29]=30; bayer[30]=54; bayer[31]=22;
        bayer[32]=3;  bayer[33]=35; bayer[34]=11; bayer[35]=43; bayer[36]=1;   bayer[37]=33; bayer[38]=9;   bayer[39]=41;
        bayer[40]=51; bayer[41]=19; bayer[42]=59; bayer[43]=27; bayer[44]=49; bayer[45]=17; bayer[46]=57; bayer[47]=25;
        bayer[48]=15; bayer[49]=47; bayer[50]=7;  bayer[51]=39; bayer[52]=13; bayer[53]=45; bayer[54]=5;   bayer[55]=37;
        bayer[56]=63; bayer[57]=31; bayer[58]=55; bayer[59]=23; bayer[60]=61; bayer[61]=29; bayer[62]=53; bayer[63]=21;
        
        for (int i = 0; i < 64; i++) {
          if (i == y * 8 + x) return float(bayer[i]) / 64.0;
        }
        return 0.0;
      }

      // Smooth simplex-style noise
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                           -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
              + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m ;
        m = m*m ;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / uResolution.xy;
        float aspect = uResolution.x / uResolution.y;
        vec2 st = vec2(uv.x * aspect, uv.y);

        // Slow flowing organic field
        float t = uTime * 0.15;
        
        // Mouse reaction ripple
        vec2 m = uMouse * vec2(aspect, 1.0);
        float mouseDist = length(st - m);
        float mouseRipple = sin(mouseDist * 16.0 - uTime * 2.5) * exp(-mouseDist * 3.5) * 0.35;

        // Domain warping
        vec2 q = vec2(
          snoise(st * 1.5 + vec2(t * 0.6, t * 0.4)),
          snoise(st * 1.5 + vec2(-t * 0.5, t * 0.7))
        );

        vec2 r = vec2(
          snoise(st * 2.2 + 2.0 * q + vec2(1.7, 9.2) + 0.12 * t),
          snoise(st * 2.2 + 2.0 * q + vec2(8.3, 2.8) + 0.14 * t)
        );

        float n = snoise(st * 0.8 + 2.0 * r) + mouseRipple;
        float intensity = clamp(n * 0.45 + 0.35, 0.0, 1.0);

        // Pixel grid size for dither cells
        float pixelScale = 4.0;
        float dither = bayer8(gl_FragCoord.xy / pixelScale);

        // Subtle Solstice Brand Palette: Deep Ink Base -> Dark Indigo -> Muted Amber Accent
        vec3 c0 = vec3(0.04, 0.06, 0.09); // #0a1018 background
        vec3 c1 = vec3(0.07, 0.09, 0.14); // subtle slate
        vec3 c2 = vec3(0.55, 0.22, 0.08); // deep subdued ember
        vec3 c3 = vec3(0.92, 0.55, 0.15); // soft sun gold highlights

        // Threshold dithered noise softly
        float dithered = step(dither, intensity * 0.85);
        float highlight = step(dither, pow(intensity, 2.2) * 0.7);

        vec3 col = mix(c0, c1, intensity);
        col = mix(col, c2, dithered * 0.32);
        col = mix(col, c3, highlight * 0.38);

        // Heavy dark vignette keeping text areas clean and legible
        // Text is in top-left and bottom-left, so vignette them darker
        float vignette = 1.0 - smoothstep(0.3, 1.3, length(uv - vec2(0.65, 0.5)));
        col = mix(c0, col, clamp(vignette, 0.15, 0.75));

        gl_FragColor = vec4(col, 1.0);
      }
    `

    function createShader(gl: WebGLRenderingContext, type: number, source: string) {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn(gl.getShaderInfoLog(shader))
        gl.deleteShader(shader)
        return null
      }
      return shader
    }

    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource)
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource)
    if (!vs || !fs) return

    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.useProgram(program)

    // Full-screen quad
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )

    const posLoc = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    const resLoc = gl.getUniformLocation(program, 'uResolution')
    const timeLoc = gl.getUniformLocation(program, 'uTime')
    const mouseLoc = gl.getUniformLocation(program, 'uMouse')

    let mouseX = 0.5
    let mouseY = 0.5
    let targetMouseX = 0.5
    let targetMouseY = 0.5

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      targetMouseX = (e.clientX - rect.left) / rect.width
      targetMouseY = 1.0 - (e.clientY - rect.top) / rect.height
    }
    window.addEventListener('mousemove', handleMouseMove, { passive: true })

    let animId: number
    const startTime = performance.now()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const width = canvas.clientWidth * dpr
      const height = canvas.clientHeight * dpr
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }
    }

    const render = () => {
      resize()
      const t = (performance.now() - startTime) / 1000

      // Smooth mouse interpolation
      mouseX += (targetMouseX - mouseX) * 0.05
      mouseY += (targetMouseY - mouseY) * 0.05

      gl.uniform2f(resLoc, canvas.width, canvas.height)
      gl.uniform1f(timeLoc, t)
      gl.uniform2f(mouseLoc, mouseX, mouseY)

      gl.drawArrays(gl.TRIANGLES, 0, 6)
      animId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('mousemove', handleMouseMove)
      gl.deleteProgram(program)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 size-full ${className}`}
      style={{ opacity: 0.65 }}
    />
  )
}
