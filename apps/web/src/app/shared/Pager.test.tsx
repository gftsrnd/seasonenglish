// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PagedList } from "./Pager.js";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const media = (width: number) => vi.stubGlobal("matchMedia", (query: string) => {
  const max = Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
  return { matches: width <= max, media: query, addEventListener: () => {}, removeEventListener: () => {} };
});
const items = ["An", "Bình", "Chi", "Dũng", "Em", "Giang", "Hà"];
const List = () => <ul><PagedList items={items} label="người học">{(name) => <li>{name}</li>}</PagedList></ul>;
const names = () => screen.getAllByRole("listitem").map((item) => item.textContent);

it("pages a long list 2 rows at a time on a phone (owner 19/11)", () => {
  media(390);
  render(<List />);
  expect(names()).toEqual(["An", "Bình"]);
  expect(screen.getByText("Trang 1/4")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Trang trước người học" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Trang sau người học" }));
  expect(names()).toEqual(["Chi", "Dũng"]);
  fireEvent.click(screen.getByRole("button", { name: "Trang sau người học" }));
  fireEvent.click(screen.getByRole("button", { name: "Trang sau người học" }));
  expect(names()).toEqual(["Hà"]);
  expect(screen.getByRole("button", { name: "Trang sau người học" })).toBeDisabled();
});

it("uses 5-row pages on a tablet (owner 19/11) and shows everything on desktop", () => {
  media(768);
  const many = [...items, "Khoa", "Lan"];
  const { unmount } = render(<ul><PagedList items={many} label="người học">{(name) => <li>{name}</li>}</PagedList></ul>);
  expect(names()).toHaveLength(5);
  expect(screen.getByText("Trang 1/2")).toBeInTheDocument();
  unmount();
  media(1280);
  render(<List />);
  expect(names()).toHaveLength(7);
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});
