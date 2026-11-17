import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TiptapVideo } from "@tcc-docs/editor-ext";
import { describe, expect, it, vi } from "vitest";

describe("TiptapVideo", () => {
  it("does not fetch an off-screen video until it approaches the viewport", () => {
    const observed: Element[] = [];
    let notifyIntersection:
      | ((entries: Array<{ isIntersecting: boolean }>) => void)
      | undefined;
    class IntersectionObserverStub {
      constructor(
        callback: (entries: Array<{ isIntersecting: boolean }>) => void,
      ) {
        notifyIntersection = callback;
      }

      observe(element: Element) {
        observed.push(element);
      }

      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
    const element = document.createElement("div");
    const editor = new Editor({
      element,
      extensions: [
        StarterKit,
        TiptapVideo.configure({
          resize: {
            enabled: true,
            directions: ["left", "right"],
          },
        }),
      ],
      content: {
        type: "doc",
        content: [
          {
            type: "video",
            attrs: {
              src: "/api/files/video-id/video.mp4",
              alt: "video.mp4",
            },
          },
        ],
      },
    });

    const placeholder = element.querySelector("[data-video-placeholder]");
    expect(placeholder).not.toBeNull();
    expect(element.querySelector("video")).toBeNull();
    expect(observed).toEqual([placeholder]);

    notifyIntersection?.([{ isIntersecting: true }]);
    const video = element.querySelector("video");
    expect(video?.getAttribute("src")).toBe("/api/files/video-id/video.mp4");
    expect(video?.getAttribute("preload")).toBe("metadata");

    editor.destroy();
    vi.unstubAllGlobals();
  });
});
