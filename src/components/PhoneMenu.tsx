"use client";

import { useState } from "react";

type Labels = { call: string; add: string; copy: string; copied: string };
const UK_LABELS: Labels = {
  call: "Подзвонити",
  add: "Додати в контакти",
  copy: "Скопіювати номер",
  copied: "Скопійовано ✓",
};

// Клік по номеру телефону: маленьке меню «подзвонити / додати в контакти /
// скопіювати». «Додати в контакти» завантажує vCard з уже заповненим ім'ям —
// телефон одразу пропонує створити контакт.
// desktopPlainCall: на широких екранах клік працює як звичайний tel:
// (потрібно для публічного сайту — там на компі все як було).
export default function PhoneMenu({
  phone,
  contactName,
  variant = "dark",
  desktopPlainCall = false,
  labels = UK_LABELS,
  className = "",
  children,
}: {
  phone: string;
  contactName: string;
  variant?: "dark" | "light";
  desktopPlainCall?: boolean;
  labels?: Labels;
  className?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const dark = variant === "dark";
  const menuBg = dark ? "bg-[#161616] ring-1 ring-[#333]" : "bg-white ring-1 ring-[#e5e5e5] shadow-xl";
  const itemCls = `flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[13px] font-semibold ${
    dark ? "text-[#ddd] hover:bg-[#222]" : "text-[#222] hover:bg-[#f4f4f4]"
  }`;

  function saveVCard() {
    // \r\n — вимога формату vCard
    const vcf =
      "BEGIN:VCARD\r\nVERSION:3.0\r\n" +
      `FN:${contactName}\r\nN:${contactName};;;;\r\n` +
      `TEL;TYPE=CELL:${phone}\r\nEND:VCARD\r\n`;
    const blob = new Blob([vcf], { type: "text/vcard;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${contactName.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "contact"}.vcf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setOpen(false);
  }

  async function copyPhone() {
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 900);
    } catch {
      setOpen(false);
    }
  }

  return (
    <span className="relative inline-block">
      <a
        href={`tel:${phone}`}
        className={className}
        onClick={(e) => {
          if (desktopPlainCall && window.matchMedia("(min-width: 768px)").matches) return;
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        {children ?? phone}
      </a>
      {open && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <span
            className={`absolute left-0 top-full z-50 mt-1.5 flex w-[220px] flex-col gap-0.5 rounded-xl p-1.5 ${menuBg}`}
          >
            <a href={`tel:${phone}`} className={itemCls} onClick={() => setOpen(false)}>
              📞 {labels.call}
            </a>
            <button onClick={saveVCard} className={itemCls}>
              👤 {labels.add}
            </button>
            <button onClick={copyPhone} className={itemCls}>
              📋 {copied ? labels.copied : labels.copy}
            </button>
          </span>
        </>
      )}
    </span>
  );
}
