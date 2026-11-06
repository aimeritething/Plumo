import { BlockNoteContext } from "@blocknote/react";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilePanel } from "./file-panel";

function panel(editor: Record<string, unknown>) {
	return (
		<BlockNoteContext.Provider
			value={{ editor: editor as never, setContentEditableProps: vi.fn() }}
		>
			<FilePanel blockId="image-block" />
		</BlockNoteContext.Provider>
	);
}

function pickFile() {
	fireEvent.change(screen.getByTestId("file-panel-upload-input"), {
		target: { files: [new File(["image"], "image.png", { type: "image/png" })] },
	});
}

const dictionary = {
	file_panel: {
		embed: {
			title: "Embed",
			url_placeholder: "Enter URL",
			embed_button: { file: "Embed file", image: "Embed image" },
		},
		upload: {
			file_placeholder: { file: "Upload file", image: "Upload image" },
			title: "Upload",
			upload_error: "Upload failed",
		},
	},
};

describe("FilePanel", () => {
	it("ignores a completed upload when a note reload removed its block", async () => {
		let currentBlock: { id: string; type: string } | undefined = {
			id: "image-block",
			type: "image",
		};
		let finishUpload: (value: string) => void = () => undefined;
		const uploadFile = vi.fn(
			() =>
				new Promise<string>((resolve) => {
					finishUpload = resolve;
				}),
		);
		const updateBlock = vi.fn();
		const editor = {
			dictionary,
			getBlock: vi.fn(() => currentBlock),
			schema: {
				blockSpecs: {
					image: { implementation: { meta: { fileBlockAccept: ["image/*"] } } },
				},
			},
			updateBlock,
			uploadFile,
		};
		const { rerender } = render(panel(editor));

		expect(
			screen.getByRole("button", { name: "Upload image" }),
		).toBeInTheDocument();
		pickFile();
		expect(uploadFile).toHaveBeenCalledWith(expect.any(File), "image-block");

		currentBlock = undefined;
		rerender(panel(editor));
		expect(screen.queryByText("Upload image")).not.toBeInTheDocument();

		await act(async () => finishUpload("/vault/attachments/image.png"));
		await waitFor(() => expect(updateBlock).not.toHaveBeenCalled());
	});

	function uploadEditor(props: Record<string, unknown>) {
		const updateBlock = vi.fn();
		const focus = vi.fn();
		const block = { id: "image-block", type: "image", props };
		const editor = {
			focus,
			dictionary,
			getBlock: vi.fn(() => block),
			schema: {
				blockSpecs: {
					image: { implementation: { meta: { fileBlockAccept: ["image/*"] } } },
				},
			},
			updateBlock,
			uploadFile: vi.fn(async () => "asset://localhost/new.png"),
		};
		return { editor, focus, updateBlock };
	}

	it("fills an empty block with the file and its name", async () => {
		const { editor, updateBlock } = uploadEditor({ url: "", name: "" });
		render(panel(editor));

		pickFile();

		await waitFor(() =>
			expect(updateBlock).toHaveBeenCalledWith("image-block", {
				props: { name: "image.png", url: "asset://localhost/new.png" },
			}),
		);
	});

	it("replaces a picture's file alone, keeping its alt text, caption and width", async () => {
		const { editor, updateBlock } = uploadEditor({
			url: "asset://localhost/old.png",
			name: "Revenue chart",
			caption: "Q3",
			previewWidth: 320,
		});
		render(panel(editor));

		pickFile();

		await waitFor(() =>
			expect(updateBlock).toHaveBeenCalledWith("image-block", {
				props: { url: "asset://localhost/new.png" },
			}),
		);
	});

	it("embeds a trimmed link in place of a picture's file, and not an empty one", async () => {
		const { editor, focus, updateBlock } = uploadEditor({
			url: "asset://localhost/old.png",
			caption: "Q3",
		});
		render(panel(editor));
		fireEvent.mouseDown(screen.getByRole("tab", { name: "Embed" }));

		const embedButton = await screen.findByRole("button", { name: "Embed image" });
		expect(embedButton).toBeDisabled();
		fireEvent.change(screen.getByTestId("file-panel-embed-input"), {
			target: { value: "  https://example.com/lake.png " },
		});
		fireEvent.click(embedButton);

		expect(updateBlock).toHaveBeenCalledWith("image-block", {
			props: { url: "https://example.com/lake.png" },
		});
		expect(focus).toHaveBeenCalledTimes(1);
	});

	it("leaves the focus where the user put it while an upload ran", async () => {
		const { editor, focus, updateBlock } = uploadEditor({ url: "asset://localhost/old.png" });
		render(panel(editor));
		const elsewhere = document.createElement("input");
		document.body.append(elsewhere);

		pickFile();
		elsewhere.focus();

		await waitFor(() => expect(updateBlock).toHaveBeenCalled());
		expect(focus).not.toHaveBeenCalled();
		elsewhere.remove();
	});
});
