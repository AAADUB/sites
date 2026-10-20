import{n as e}from"./gsap-DpXcylxa.js";import{E as t,M as n,O as r,Q as i,W as a,X as o,it as s,k as c,v as l}from"./sim-CQ5BxiR-.js";import{E as u}from"./cycle-4uBIJy2s.js";var d=`
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor * a, a * vAlpha);
}`,f=class{constructor(t,u,f){e(this,`points`,void 0),e(this,`mat`,void 0),e(this,`time`,0);let p=l(42),m=new Float32Array(t*4);for(let e=0;e<t*4;e++)m[e]=p();let h=new c;h.setAttribute(`position`,new r(new Float32Array(t*3),3)),h.setAttribute(`aSeed`,new r(m,4)),h.boundingSphere=new i(new s(0,2,0),3),this.mat=new o({uniforms:{uCrown:{value:2},uHead:{value:2.3},uR:{value:u},uClipZ:{value:10},uTime:{value:0},uSwirl:{value:1},uPlug:{value:new s},uFlameR:{value:0},uFresh:{value:1},uTempN:{value:0},uHot:{value:0},uVis:{value:1},uSize:{value:26},uPx:{value:1},uDiesel:{value:+(f===`diesel`)},uCyan:{value:new n(`#3fd0ff`)},uAmber:{value:new n(`#ff8a1f`)},uWhite:{value:new n(`#fff3d6`)},uGrey:{value:new n(`#8f8781`)}},vertexShader:`
        attribute vec4 aSeed;
        uniform float uCrown, uHead, uR, uClipZ, uTime, uSwirl, uFlameR, uFresh, uTempN, uHot, uVis, uSize, uPx, uDiesel;
        uniform vec3 uPlug, uCyan, uAmber, uWhite, uGrey;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float rho = uR * sqrt(aSeed.x) * (0.96 + 0.04 * sin(uTime * 2.3 + aSeed.w * 40.0));
          float ang = aSeed.y * 6.2831853 + uTime * (0.35 + aSeed.z * 0.6) * uSwirl;
          float h = fract(aSeed.w + 0.035 * sin(uTime * 1.3 + aSeed.x * 31.0));
          float gap = max(0.0, uHead - uCrown);
          float y = uCrown + 0.006 + h * max(0.0, gap - 0.012);
          vec3 p = vec3(rho * cos(ang), y, rho * sin(ang));
          bool fresh = aSeed.z < uFresh;
          float inFlame;
          if (uDiesel > 0.5) {
            // diesel: combustion starts around the spray tips (ring at ~0.6 R) and spreads
            float ring = abs(rho / uR - 0.62);
            inFlame = step(ring, uFlameR / uR);
          } else {
            inFlame = step(distance(p, uPlug), uFlameR);
          }
          vec3 freshCol = mix(uCyan, mix(uCyan, uAmber, 0.85), smoothstep(0.0, 1.0, uTempN));
          vec3 hotCol = mix(uGrey, mix(uAmber, uWhite, smoothstep(0.55, 1.0, uHot)), smoothstep(0.08, 0.5, uHot));
          float burnedP = fresh ? inFlame : 1.0;
          vec3 col = mix(freshCol, hotCol, burnedP);
          float glow = burnedP * (0.6 + 2.6 * uHot);
          vColor = col * (0.75 + glow);
          vAlpha = uVis * mix(0.55 + 0.25 * uTempN, 0.75, burnedP);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * uPx * (0.6 + 0.8 * aSeed.z) / max(0.1, -mv.z) * (1.0 + 0.35 * burnedP * uHot);
          vec4 wp = modelMatrix * vec4(p, 1.0);
          if (p.z > uClipZ || uVis < 0.01 || gap < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          if (wp.y > 1e6) vAlpha = 0.0;
        }`,fragmentShader:d,transparent:!0,depthWrite:!1,blending:2}),this.points=new a(h,this.mat),this.points.frustumCulled=!1,this.points.renderOrder=2}setClip(e){this.mat.uniforms.uClipZ.value=e}setSize(e){this.mat.uniforms.uSize.value=e}update(e){let n=this.mat.uniforms;this.time+=e.dt,n.uTime.value=this.time,n.uCrown.value=e.crownY,n.uHead.value=e.headY,n.uPlug.value.copy(e.plug),n.uVis.value=e.visible,n.uPx.value=t.dpr;let r=u(e.theta),i=e.kind===`two-stroke`,a;if(i){let e=r%360;a=e<118?1:e<245?Math.min(1,Math.max(0,(e-118)/110)):1}else a=r<8?0:r<200?Math.min(1,(r-8)/160):+(r<540);let o=e.burned>.985;n.uFresh.value=o&&!(i?r%360>118&&r%360<300:r<200)?0:a,n.uFlameR.value=e.burned>.001?.9*Math.cbrt(e.burned):0,n.uTempN.value=Math.min(1,Math.max(0,(e.temp-320)/600))*(e.burned<.02?1:.3),n.uHot.value=Math.min(1,Math.max(0,(e.temp-650)/1900)),n.uSwirl.value=i?1.2:r<225?1.6:.8}dispose(){this.points.geometry.dispose(),this.mat.dispose()}},p=class{constructor(t,i,s,u){e(this,`points`,void 0),e(this,`t`,void 0),e(this,`ox`,void 0),e(this,`oy`,void 0),e(this,`sp`,void 0),e(this,`frames`,[]),e(this,`radius`,void 0),e(this,`mat`,void 0),e(this,`kind`,void 0),e(this,`heat`,0),this.kind=u,this.radius=s;let f=l(u===`intake`?11:23);this.t=new Float32Array(t),this.ox=new Float32Array(t),this.oy=new Float32Array(t),this.sp=new Float32Array(t);for(let e=0;e<t;e++){this.t[e]=f();let t=f()*Math.PI*2,n=Math.sqrt(f())*.82;this.ox[e]=Math.cos(t)*n,this.oy[e]=Math.sin(t)*n,this.sp[e]=.7+f()*.6}let p=i.computeFrenetFrames(96,!1);for(let e=0;e<=96;e++)this.frames.push({p:i.getPointAt(e/96),n:p.normals[e].clone(),b:p.binormals[e].clone()});let m=new c;m.setAttribute(`position`,new r(new Float32Array(t*3),3)),m.setAttribute(`aT`,new r(this.t,1)),this.mat=new o({uniforms:{uColor:{value:new n(u===`intake`?`#3fd0ff`:`#8f8781`)},uHot:{value:new n(`#ff8a1f`)},uHeat:{value:0},uAlpha:{value:.6},uSize:{value:22},uPx:{value:1},uClipZ:{value:10}},vertexShader:`
        attribute float aT;
        uniform vec3 uColor, uHot;
        uniform float uHeat, uAlpha, uSize, uPx, uClipZ;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * uPx / max(0.1, -mv.z);
          float heatHere = uHeat * (1.0 - aT);
          vColor = mix(uColor, uHot, heatHere) * (0.8 + 1.6 * heatHere);
          vAlpha = uAlpha * smoothstep(0.0, 0.08, aT) * smoothstep(1.0, 0.9, aT);
          if (position.z > uClipZ) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,fragmentShader:d,transparent:!0,depthWrite:!1,blending:2}),this.points=new a(m,this.mat),this.points.frustumCulled=!1,this.points.renderOrder=2}setClip(e){this.mat.uniforms.uClipZ.value=e}update(e,n,r,i,a,o){let s=this.t.length,c=this.points.geometry.getAttribute(`position`),l=c.array,u=this.frames.length-1,d=Math.max(0,n)*(.25+.75*Math.min(1,r))*.9;if(this.kind===`exhaust`){let t=n>.05?Math.min(1,Math.max(0,(i-500)/1300)):0;this.heat+=(t-this.heat)*Math.min(1,e*6)}for(let t=0;t<s;t++){let n=this.t[t]+d*this.sp[t]*e;n>=1&&--n,this.t[t]=n;let r=n*u,i=Math.min(u-1,Math.floor(r)),a=r-i,o=this.frames[i],s=this.frames[i+1],c=this.radius(n),f=o.p.x+(s.p.x-o.p.x)*a,p=o.p.y+(s.p.y-o.p.y)*a,m=o.p.z+(s.p.z-o.p.z)*a,h=o.n.x+(s.n.x-o.n.x)*a,g=o.n.y+(s.n.y-o.n.y)*a,_=o.n.z+(s.n.z-o.n.z)*a,v=o.b.x+(s.b.x-o.b.x)*a,y=o.b.y+(s.b.y-o.b.y)*a,b=o.b.z+(s.b.z-o.b.z)*a;l[t*3]=f+(h*this.ox[t]+v*this.oy[t])*c,l[t*3+1]=p+(g*this.ox[t]+y*this.oy[t])*c,l[t*3+2]=m+(_*this.ox[t]+b*this.oy[t])*c}c.needsUpdate=!0,this.points.geometry.getAttribute(`aT`).needsUpdate=!0;let f=this.mat.uniforms;f.uHeat.value=this.heat,f.uPx.value=t.dpr,f.uAlpha.value=a*(.22+.5*Math.min(1,n*1.4))}dispose(){this.points.geometry.dispose(),this.mat.dispose()}},m=class{constructor(t,n,i,u){e(this,`points`,void 0),e(this,`dirs`,[]),e(this,`seed`,void 0),e(this,`nozzle`,void 0),e(this,`reach`,void 0),e(this,`mat`,void 0),this.nozzle=n.clone(),this.reach=u;for(let e=0;e<i;e++){let t=e/i*Math.PI*2+.3,n=.32;this.dirs.push(new s(Math.cos(t)*Math.cos(n),-Math.sin(n),Math.sin(t)*Math.cos(n)))}let f=l(5);this.seed=new Float32Array(t*3);for(let e=0;e<this.seed.length;e++)this.seed[e]=f();let p=new c;p.setAttribute(`position`,new r(new Float32Array(t*3),3)),p.setAttribute(`aHeat`,new r(new Float32Array(t),1)),this.mat=new o({uniforms:{uVis:{value:0},uPx:{value:1},uClipZ:{value:10}},vertexShader:`
        attribute float aHeat;
        uniform float uVis, uPx, uClipZ;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = 18.0 * uPx / max(0.1, -mv.z);
          vColor = mix(vec3(1.0, 0.93, 0.78), vec3(1.0, 0.55, 0.15) * 2.6, aHeat);
          vAlpha = uVis * 0.8;
          if (position.z > uClipZ || uVis < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,fragmentShader:d,transparent:!0,depthWrite:!1,blending:2}),this.points=new a(p,this.mat),this.points.frustumCulled=!1,this.points.renderOrder=3}setClip(e){this.mat.uniforms.uClipZ.value=e}update(e,n,r,i){let a=u(e-n),o=a<32,s=this.points.geometry.getAttribute(`position`),c=this.points.geometry.getAttribute(`aHeat`),l=s.array,d=c.array,f=l.length/3,p=this.dirs.length,m=a>26?1-(a-26)/6:1;for(let e=0;e<f;e++){let t=e%p,n=this.dirs[t],i=this.seed[e*3],o=this.seed[e*3+1],s=this.seed[e*3+2],c=i*(Math.min(1,a/10)*this.reach),u=.12*(c/this.reach),f=this.nozzle.x+n.x*c+(o-.5)*u,m=this.nozzle.y+n.y*c+(s-.5)*u*.6,h=this.nozzle.z+n.z*c+(s-.5)*u,g=r+.008;m<g&&(m=g);let _=Math.hypot(f,h);_>this.reach&&(f*=this.reach/_,h*=this.reach/_,c=this.reach),l[e*3]=f,l[e*3+1]=m,l[e*3+2]=h,d[e]=a>5?Math.min(1,Math.max(0,(i-.55)*3+(a-5)/12)):0}s.needsUpdate=!0,c.needsUpdate=!0,this.mat.uniforms.uVis.value=o?i*Math.max(0,m):0,this.mat.uniforms.uPx.value=t.dpr}dispose(){this.points.geometry.dispose(),this.mat.dispose()}};export{p as n,m as r,f as t};