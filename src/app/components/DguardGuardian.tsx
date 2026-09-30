"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type DguardGuardianProps = {
  active: boolean;
  complete: boolean;
};

function shieldShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-0.53, 0.62);
  shape.quadraticCurveTo(0, 0.82, 0.53, 0.62);
  shape.lineTo(0.48, -0.02);
  shape.quadraticCurveTo(0.42, -0.53, 0, -0.83);
  shape.quadraticCurveTo(-0.42, -0.53, -0.48, -0.02);
  shape.closePath();
  return shape;
}

export default function DguardGuardian({ active, complete }: DguardGuardianProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ active, complete });

  useEffect(() => {
    stateRef.current = { active, complete };
  }, [active, complete]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 50);
    camera.position.set(0, 0.02, 9.4);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.24;
    host.appendChild(renderer.domElement);

    const figure = new THREE.Group();
    scene.add(figure);

    const armor = new THREE.MeshPhysicalMaterial({
      color: 0x287be0,
      metalness: 0.68,
      roughness: 0.24,
      clearcoat: 0.9,
      clearcoatRoughness: 0.16,
      emissive: 0x063a90,
      emissiveIntensity: 0.36,
    });
    const armorLight = new THREE.MeshPhysicalMaterial({
      color: 0x91dfff,
      metalness: 0.72,
      roughness: 0.19,
      clearcoat: 1,
      emissive: 0x0c67c9,
      emissiveIntensity: 0.45,
    });
    const deep = new THREE.MeshStandardMaterial({ color: 0x0b2450, metalness: 0.62, roughness: 0.34 });
    const glow = new THREE.MeshStandardMaterial({ color: 0xc6f5ff, emissive: 0x54b9ff, emissiveIntensity: 1.4, metalness: 0.42, roughness: 0.22 });
    const face = new THREE.MeshStandardMaterial({ color: 0x06142e, metalness: 0.24, roughness: 0.4 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.57, 0.78, 8, 20), armor);
    torso.scale.set(1.15, 1, 0.78);
    torso.position.set(0, -0.44, 0);
    figure.add(torso);

    const breastplate = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.59, 0.79, 6, 1), armorLight);
    breastplate.scale.z = 0.5;
    breastplate.rotation.x = 0.12;
    breastplate.position.set(0, -0.43, 0.39);
    figure.add(breastplate);

    const breastInset = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 1), glow);
    breastInset.scale.set(0.8, 1.3, 0.5);
    breastInset.position.set(0, -0.38, 0.69);
    figure.add(breastInset);

    const helmet = new THREE.Group();
    helmet.position.set(0, 0.85, 0.02);
    figure.add(helmet);

    const helmCap = new THREE.Mesh(new THREE.SphereGeometry(0.56, 40, 28), armorLight);
    helmCap.scale.set(0.92, 1.13, 0.8);
    helmCap.position.y = 0.08;
    helmet.add(helmCap);

    const helmLower = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.56, 6, 1), armor);
    helmLower.rotation.x = Math.PI;
    helmLower.scale.set(0.96, 0.92, 0.76);
    helmLower.position.set(0, -0.23, 0.09);
    helmet.add(helmLower);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.2, 0.12), face);
    visor.position.set(0, 0.02, 0.47);
    visor.rotation.x = -0.12;
    helmet.add(visor);

    const eyeStrip = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.025, 0.04), glow);
    eyeStrip.position.set(0, 0.025, 0.54);
    helmet.add(eyeStrip);

    const noseGuard = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.35, 5), armorLight);
    noseGuard.position.set(0, -0.2, 0.49);
    noseGuard.rotation.x = 0.16;
    helmet.add(noseGuard);

    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.65, 5, 1), armorLight);
    crest.position.set(0, 0.68, -0.05);
    crest.rotation.z = -0.06;
    helmet.add(crest);

    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.37, 28, 20), armor);
    shoulder.scale.set(1.28, 0.92, 0.8);
    const shoulderLeft = shoulder.clone();
    shoulderLeft.position.set(-0.73, 0.02, 0.02);
    const shoulderRight = shoulder.clone();
    shoulderRight.position.set(0.73, 0.02, 0.02);
    figure.add(shoulderLeft, shoulderRight);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.085, 12, 48), armorLight);
    collar.scale.set(1.1, 0.7, 0.75);
    collar.position.set(0, 0.34, 0.02);
    figure.add(collar);

    const shieldGroup = new THREE.Group();
    shieldGroup.position.set(-0.98, -0.12, 0.56);
    shieldGroup.rotation.z = -0.16;
    shieldGroup.rotation.y = -0.1;
    figure.add(shieldGroup);

    const shieldDepth = new THREE.ExtrudeGeometry(shieldShape(), { depth: 0.16, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.045, bevelThickness: 0.04 });
    shieldDepth.computeVertexNormals();
    const shield = new THREE.Mesh(shieldDepth, armorLight);
    shield.position.z = -0.08;
    shield.castShadow = true;
    shieldGroup.add(shield);

    const shieldFace = new THREE.Mesh(new THREE.ShapeGeometry(shieldShape()), deep);
    shieldFace.position.z = 0.105;
    shieldFace.scale.set(0.86, 0.87, 1);
    shieldGroup.add(shieldFace);

    const shieldRim = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.ShapeGeometry(shieldShape()), 8),
      new THREE.LineBasicMaterial({ color: 0xc2f1ff, transparent: true, opacity: 0.9 }),
    );
    shieldRim.position.z = 0.13;
    shieldGroup.add(shieldRim);

    const shieldBoss = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 1), glow);
    shieldBoss.position.set(0, 0.34, 0.16);
    shieldBoss.scale.set(0.8, 1.1, 0.45);
    shieldGroup.add(shieldBoss);

    const wordCanvas = document.createElement("canvas");
    wordCanvas.width = 512;
    wordCanvas.height = 160;
    const context = wordCanvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, wordCanvas.width, wordCanvas.height);
      context.font = "700 74px Arial, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = "#e3f8ff";
      context.shadowColor = "#63c9ff";
      context.shadowBlur = 12;
      context.fillText("Dguard", wordCanvas.width / 2, wordCanvas.height / 2);
    }
    const wordTexture = new THREE.CanvasTexture(wordCanvas);
    wordTexture.colorSpace = THREE.SRGBColorSpace;
    const wordMark = new THREE.Mesh(
      new THREE.PlaneGeometry(0.74, 0.23),
      new THREE.MeshBasicMaterial({ map: wordTexture, transparent: true, depthWrite: false, toneMapped: false }),
    );
    wordMark.position.set(0, -0.03, 0.145);
    shieldGroup.add(wordMark);

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.72, 12), deep);
    grip.rotation.z = -0.17;
    grip.position.set(-0.02, 0.02, -0.19);
    shieldGroup.add(grip);

    const leftArm = new THREE.Group();
    leftArm.position.set(-0.72, -0.05, 0.02);
    figure.add(leftArm);
    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.43, 6, 12), armor);
    upperArm.rotation.z = 0.16;
    upperArm.position.set(-0.18, -0.35, 0.02);
    leftArm.add(upperArm);
    const gauntlet = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 16), armorLight);
    gauntlet.scale.set(1, 0.78, 0.7);
    gauntlet.position.set(-0.1, -0.2, 0.45);
    leftArm.add(gauntlet);

    const rightArm = new THREE.Group();
    rightArm.position.set(0.72, -0.05, 0.02);
    figure.add(rightArm);
    const upperArmRight = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.44, 6, 12), armor);
    upperArmRight.rotation.z = -0.16;
    upperArmRight.position.set(0.18, -0.34, 0.01);
    rightArm.add(upperArmRight);
    const thinkingForearm = new THREE.Group();
    thinkingForearm.position.set(0.25, -0.57, 0.06);
    rightArm.add(thinkingForearm);
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.46, 6, 12), armorLight);
    forearm.rotation.z = -0.86;
    forearm.position.set(-0.06, 0.35, 0.02);
    thinkingForearm.add(forearm);
    const chinHand = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 16), armorLight);
    chinHand.scale.set(0.92, 0.76, 0.8);
    chinHand.position.set(-0.25, 0.59, 0.2);
    thinkingForearm.add(chinHand);
    for (let finger = 0; finger < 3; finger += 1) {
      const digit = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.13, 4, 8), armorLight);
      digit.rotation.z = 0.34;
      digit.position.set(-0.19 + finger * 0.07, -0.15, 0.5);
      thinkingForearm.add(digit);
    }

    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.06, 12, 56), armorLight);
    belt.scale.set(1.18, 0.55, 0.65);
    belt.position.set(0, -1.01, 0.11);
    figure.add(belt);

    const underglow = new THREE.Mesh(
      new THREE.CircleGeometry(1.55, 64),
      new THREE.MeshBasicMaterial({ color: 0x4dbbff, transparent: true, opacity: 0.08, depthWrite: false }),
    );
    underglow.rotation.x = -Math.PI / 2;
    underglow.position.set(0.2, -1.65, -0.12);
    figure.add(underglow);

    scene.add(new THREE.AmbientLight(0x93c9ff, 2.1));
    const keyLight = new THREE.PointLight(0x7de1ff, 32, 14);
    keyLight.position.set(2.8, 3, 4);
    scene.add(keyLight);
    const sideLight = new THREE.PointLight(0x246aff, 22, 12);
    sideLight.position.set(-2.8, -0.4, 2);
    scene.add(sideLight);

    const resize = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    });
    resize.observe(host);

    const pointer = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      const bounds = host.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / Math.max(1, bounds.width) - 0.5) * 2;
      pointer.y = ((event.clientY - bounds.top) / Math.max(1, bounds.height) - 0.5) * 2;
    };
    host.addEventListener("pointermove", onPointerMove);

    const startedAt = performance.now();
    let frame = 0;
    let disposed = false;
    const smoothstep = (edge0: number, edge1: number, value: number) => {
      const amount = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
      return amount * amount * (3 - 2 * amount);
    };
    const animate = () => {
      if (disposed) return;
      frame = requestAnimationFrame(animate);
      const time = (performance.now() - startedAt) / 1000;
      const state = stateRef.current;
      const think = state.active ? 1 : state.complete ? 0 : 0;
      const energy = state.active ? 1.1 : state.complete ? 0.78 : 0.5;
      const idleSway = Math.sin(time * 0.68) * 0.024;
      figure.rotation.y += ((pointer.x * 0.11 + Math.sin(time * 0.34) * 0.035) - figure.rotation.y) * 0.04;
      figure.rotation.x += ((-pointer.y * 0.065 + Math.sin(time * 0.56) * 0.018) - figure.rotation.x) * 0.04;
      figure.position.y += ((-0.18 + idleSway + (state.active ? Math.sin(time * 2.6) * 0.045 : 0)) - figure.position.y) * 0.08;
      helmet.rotation.x += ((state.active ? 0.13 + Math.sin(time * 1.15) * 0.035 : state.complete ? -0.025 : 0.015) - helmet.rotation.x) * 0.055;
      helmet.rotation.z += ((state.active ? -0.11 : Math.sin(time * 0.4) * 0.018) - helmet.rotation.z) * 0.045;
      rightArm.rotation.z += ((state.active ? -0.44 : state.complete ? 0.02 : -0.1) - rightArm.rotation.z) * 0.055;
      const thinkLift = state.active ? 0.78 : state.complete ? -0.16 : 0;
      thinkingForearm.position.y += ((-0.57 + thinkLift) - thinkingForearm.position.y) * 0.075;
      thinkingForearm.position.z += ((0.06 + (state.active ? 0.38 : state.complete ? 0.04 : 0)) - thinkingForearm.position.z) * 0.075;
      thinkingForearm.rotation.z += ((state.active ? 0.1 + Math.sin(time * 4.8) * 0.12 : state.complete ? -0.1 : 0) - thinkingForearm.rotation.z) * 0.07;
      leftArm.rotation.z += ((state.complete ? 0.04 : 0) - leftArm.rotation.z) * 0.06;
      shieldGroup.rotation.y += ((pointer.x * 0.045 + (state.active ? Math.sin(time * 1.8) * 0.025 : 0)) - shieldGroup.rotation.y) * 0.045;
      shieldGroup.rotation.z += ((-0.16 + (state.complete ? 0.04 : 0) + idleSway) - shieldGroup.rotation.z) * 0.055;
      armor.emissiveIntensity = energy + (state.active ? Math.sin(time * 7) * 0.12 : 0);
      armorLight.emissiveIntensity = energy * 0.8 + (state.active ? Math.sin(time * 7) * 0.16 : 0);
      underglow.material.opacity = 0.06 + smoothstep(0, 1, think) * (0.045 + Math.sin(time * 5) * 0.015);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else material.dispose();
        }
      });
      wordTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className={`guardian-canvas${active ? " is-scanning" : ""}${complete ? " is-complete" : ""}`} ref={hostRef} aria-hidden="true" />;
}
