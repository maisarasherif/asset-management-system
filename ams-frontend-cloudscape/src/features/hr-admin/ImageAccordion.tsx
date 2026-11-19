/**
 * @license Bencho Image Accordion, MIT (https://bencho.dev/licence).
 * Copyright Bencho.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { Icon } from "@cloudscape-design/components";
import { useEffect, useRef, useState } from "react";
import type { HRAdminOverviewGroup, HRAdminSubjectType } from "../../types/ams";
import { subjectGroups } from "./hrAdminRegistry";

const order: HRAdminSubjectType[] = ["PERSON", "VEHICLE", "COMPANY"];

// Bencho image accordion: one spring per picture, no stagger. Flex distributes
// a fixed strip width, so every pixel one panel gains comes from its neighbours.
function usePanelSpring(target: number) {
  const [value, setValue] = useState(target);
  const position = useRef(target);
  const velocity = useRef(0);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previous = 0;
    function settle() {
      cancelAnimationFrame(frame);
      position.current = target;
      velocity.current = 0;
      setValue(target);
    }
    function tick(time: number) {
      /* Frames, not milliseconds. dt is expressed in sixtieths of
         a second and the damping is RAISED to it rather than
         multiplied by it, so a dropped frame decays the same amount
         of energy as the two frames it replaced. */
      const dt = previous ? Math.min((time - previous) / 16.67, 2.5) : 1;
      previous = time;
      velocity.current += (target - position.current) * 0.096 * dt;
      velocity.current *= Math.pow(0.64, dt);
      position.current += velocity.current * dt;
      /* Units matter. The snap threshold is absolute, so a caller
         works in pixels or in 0..100 — a spring driven over 0..1
         would be "settled" before it had visibly moved. */
      if (Math.abs(target - position.current) < 0.02 && Math.abs(velocity.current) < 0.02) {
        settle();
      } else {
        setValue(position.current);
        frame = requestAnimationFrame(tick);
      }
    }
    if (motion.matches) settle();
    else if (position.current !== target || velocity.current !== 0) frame = requestAnimationFrame(tick);
    motion.addEventListener("change", settle);
    return () => {
      cancelAnimationFrame(frame);
      motion.removeEventListener("change", settle);
    };
  }, [target]);
  return value;
}

function SubjectPanel({
  group,
  selected,
  target,
  onSelect,
  onPreview,
}: {
  group: HRAdminOverviewGroup;
  selected: boolean;
  target: number;
  onSelect: () => void;
  onPreview: () => void;
}) {
  const swell = usePanelSpring(target);
  const label = subjectGroups[group.subject_type];
  return (
    <button
      type="button"
      className="hr-subject-panel"
      aria-pressed={selected}
      style={{ flexGrow: 1 + (1.8 * swell) / 100 }}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") onPreview();
      }}
      onClick={onSelect}
    >
      <img src={`/hr-admin/${label.toLowerCase()}.jpg`} alt="" draggable={false} />
      <span className="hr-subject-panel__caption">
        <strong>
          {selected && <Icon name="status-positive" />} {label} ({group.subject_count})
        </strong>
        <span className={group.expired_count ? "hr-subject-panel__expired" : undefined}>
          {group.expired_count} expired {group.expired_count === 1 ? "record" : "records"}
        </span>
      </span>
    </button>
  );
}

export function ImageAccordion({
  groups,
  selected,
  onSelect,
}: {
  groups: HRAdminOverviewGroup[];
  selected: HRAdminSubjectType | null;
  onSelect: (group: HRAdminSubjectType) => void;
}) {
  const [hover, setHover] = useState<HRAdminSubjectType | null>(null);
  const activeType = hover ?? selected;
  const active = activeType ? order.indexOf(activeType) : -1;
  return (
    <div
      className="hr-subject-strip"
      role="group"
      aria-label="Subject groups"
      onPointerLeave={() => setHover(null)}
      onPointerCancel={() => setHover(null)}
    >
      {order.map((type, index) => {
        const group = groups.find((item) => item.subject_type === type);
        if (!group) return null;
        // A Gaussian falloff lets the immediate neighbour share a little of the swell.
        const target = active < 0 ? 0 : 100 * Math.exp(-(((index - active) / 0.665) ** 2));
        return (
          <SubjectPanel
            key={type}
            group={group}
            target={target}
            selected={selected === type}
            onSelect={() => {
              setHover(null);
              onSelect(type);
            }}
            onPreview={() => setHover(type)}
          />
        );
      })}
    </div>
  );
}
