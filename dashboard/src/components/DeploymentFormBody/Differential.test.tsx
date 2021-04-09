import ReactDiffViewer from "react-diff-viewer";
import { SupportedThemes } from "shared/Config";
import { defaultStore, getStore, mountWrapper } from "shared/specs/mountWrapper";
import Differential from "./Differential";

it("should render a diff between two strings", () => {
  const wrapper = mountWrapper(
    defaultStore,
    <Differential oldValues="foo" newValues="bar" emptyDiffText="empty" />,
  );
  expect(wrapper.find(ReactDiffViewer).props()).toMatchObject({ oldValue: "foo", newValue: "bar" });
});

it("should print the emptyDiffText if there are no changes", () => {
  const wrapper = mountWrapper(
    defaultStore,
    <Differential oldValues="foo" newValues="foo" emptyDiffText="No differences!" />,
  );
  expect(wrapper.text()).toMatch("No differences!");
  expect(wrapper.text()).not.toMatch("foo");
});

it("sets light theme by default", () => {
  const wrapper = mountWrapper(
    defaultStore,
    <Differential oldValues="foo" newValues="bar" emptyDiffText="empty" />,
  );
  expect(wrapper.find(ReactDiffViewer).prop("useDarkTheme")).toBe(false);
});

it("changes theme", () => {
  const wrapper = mountWrapper(
    getStore({ config: { theme: SupportedThemes.dark } }),
    <Differential oldValues="foo" newValues="bar" emptyDiffText="empty" />,
  );
  expect(wrapper.find(ReactDiffViewer).prop("useDarkTheme")).toBe(true);
});
