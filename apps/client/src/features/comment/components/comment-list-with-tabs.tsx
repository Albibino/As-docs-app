import React, { useState, useRef, useCallback, memo, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  ActionIcon,
  Center,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  ScrollArea,
} from "@mantine/core";
import CommentListItem from "@/features/comment/components/comment-list-item";
import {
  useCommentsQuery,
  useCreateCommentMutation,
} from "@/features/comment/queries/comment-query";
import CommentEditor from "@/features/comment/components/comment-editor";
import CommentActions from "@/features/comment/components/comment-actions";
import { useFocusWithin } from "@mantine/hooks";
import { IComment } from "@/features/comment/types/comment.types.ts";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import { IPagination } from "@/lib/types.ts";
import { extractPageSlugId } from "@/lib";
import { useTranslation } from "react-i18next";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";
import { IconArrowUp, IconMessageOff } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";

function CommentListWithTabs() {
  const { t } = useTranslation();
  const { pageSlug } = useParams();
  const { data: page } = usePageQuery({ pageId: extractPageSlugId(pageSlug) });
  const {
    data: comments,
    isLoading: isCommentsLoading,
    isError,
  } = useCommentsQuery({ pageId: page?.id });
  const createCommentMutation = useCreateCommentMutation();
  const [isLoading, setIsLoading] = useState(false);
  const { data: space } = useGetSpaceBySlugQuery(page?.space?.slug);
  const userSpaceRole =
    space?.permission?.source === "explicit" ? "member" : "admin";

  const canComment =
    (page?.permissions?.canEdit ?? false) ||
    (space?.settings?.comments?.allowViewerComments === true);

  const activeComments = useMemo(
    () =>
      (comments?.items ?? []).filter(
        (comment: IComment) => comment.parentCommentId === null,
      ),
    [comments],
  );

  const [isPageCommentLoading, setIsPageCommentLoading] = useState(false);

  const handleAddPageComment = useCallback(
    async (_commentId: string, content: string) => {
      try {
        setIsPageCommentLoading(true);
        const createdComment = await createCommentMutation.mutateAsync({
          pageId: page?.id,
          content: JSON.stringify(content),
        });

        setTimeout(() => {
          const selector = `div[data-comment-id="${createdComment.id}"]`;
          const commentElement = document.querySelector(selector);
          commentElement?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 400);
      } catch (error) {
        console.error("Failed to post comment:", error);
      } finally {
        setIsPageCommentLoading(false);
      }
    },
    [createCommentMutation, page?.id],
  );

  const handleAddReply = useCallback(
    async (commentId: string, content: string) => {
      try {
        setIsLoading(true);
        const commentData = {
          pageId: page?.id,
          parentCommentId: commentId,
          content: JSON.stringify(content),
        };

        await createCommentMutation.mutateAsync(commentData);
      } catch (error) {
        console.error("Failed to post comment:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [createCommentMutation, page?.id],
  );

  const renderComments = useCallback(
    (comment: IComment) => (
      <Paper
        shadow="sm"
        radius="md"
        p="sm"
        mb="sm"
        withBorder
        key={comment.id}
        data-comment-id={comment.id}
      >
        <div>
          <CommentListItem
            comment={comment}
            pageId={page?.id}
            canComment={canComment}
            userSpaceRole={userSpaceRole}
          />
          <MemoizedChildComments
            comments={comments}
            parentId={comment.id}
            pageId={page?.id}
            canComment={canComment}
            userSpaceRole={userSpaceRole}
          />
        </div>

        {canComment && (
          <>
            <Divider my={4} />
            <CommentEditorWithActions
              commentId={comment.id}
              onSave={handleAddReply}
              isLoading={isLoading}
            />
          </>
        )}
      </Paper>
    ),
    [comments, handleAddReply, isLoading, userSpaceRole, canComment],
  );

  if (isCommentsLoading) {
    return <></>;
  }

  if (isError) {
    return <div>{t("Error loading comments.")}</div>;
  }

  const pageCommentInput = canComment ? (
    <PageCommentInput
      onSave={handleAddPageComment}
      isLoading={isPageCommentLoading}
    />
  ) : null;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <ScrollArea
        style={{ flex: "1 1 auto" }}
        scrollbarSize={5}
        type="scroll"
      >
        <div style={{ paddingBottom: "8px" }}>
          {activeComments.length === 0 ? (
            <Center py="xl">
              <Stack align="center" gap="xs">
                <IconMessageOff
                  size={32}
                  stroke={1.5}
                  color="var(--mantine-color-dimmed)"
                />
                <Text size="sm" c="dimmed">
                  {t("No open comments.")}
                </Text>
              </Stack>
            </Center>
          ) : (
            activeComments.map(renderComments)
          )}
        </div>
      </ScrollArea>
      {pageCommentInput}
    </div>
  );
}

interface ChildCommentsProps {
  comments: IPagination<IComment>;
  parentId: string;
  pageId: string;
  canComment: boolean;
  userSpaceRole?: string;
}
const ChildComments = ({
  comments,
  parentId,
  pageId,
  canComment,
  userSpaceRole,
}: ChildCommentsProps) => {
  const getChildComments = useCallback(
    (parentId: string) =>
      comments.items.filter(
        (comment: IComment) => comment.parentCommentId === parentId,
      ),
    [comments.items],
  );

  return (
    <div>
      {getChildComments(parentId).map((childComment) => (
        <div key={childComment.id}>
          <CommentListItem
            comment={childComment}
            pageId={pageId}
            canComment={canComment}
            userSpaceRole={userSpaceRole}
          />
          <MemoizedChildComments
            comments={comments}
            parentId={childComment.id}
            pageId={pageId}
            canComment={canComment}
            userSpaceRole={userSpaceRole}
          />
        </div>
      ))}
    </div>
  );
};

const MemoizedChildComments = memo(ChildComments);

const CommentEditorWithActions = ({
  commentId,
  onSave,
  isLoading,
  placeholder = undefined,
}) => {
  const [content, setContent] = useState("");
  const { ref, focused } = useFocusWithin();
  const commentEditorRef = useRef(null);

  const handleSave = useCallback(() => {
    onSave(commentId, content);
    setContent("");
    commentEditorRef.current?.clearContent();
  }, [commentId, content, onSave]);

  return (
    <div ref={ref}>
      <CommentEditor
        ref={commentEditorRef}
        onUpdate={setContent}
        onSave={handleSave}
        editable={true}
        placeholder={placeholder}
      />
      {focused && <CommentActions onSave={handleSave} isLoading={isLoading} />}
    </div>
  );
};

const PageCommentInput = ({ onSave, isLoading }) => {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const { ref, focused } = useFocusWithin();
  const commentEditorRef = useRef(null);
  const [currentUser] = useAtom(currentUserAtom);

  const handleSave = useCallback(() => {
    onSave(null, content);
    setContent("");
    commentEditorRef.current?.clearContent();
  }, [content, onSave]);

  return (
    <div
      ref={ref}
      style={{
        flex: "0 0 auto",
        borderTop: "1px solid var(--mantine-color-default-border)",
        paddingTop: "var(--mantine-spacing-sm)",
        paddingBottom: 25,
        position: "relative",
      }}
    >
      <Group wrap="nowrap" align="flex-start" gap="xs">
        <CustomAvatar
          size="sm"
          avatarUrl={currentUser?.user?.avatarUrl}
          name={currentUser?.user?.name}
          style={{ flexShrink: 0, marginTop: 10 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <CommentEditor
            ref={commentEditorRef}
            onUpdate={setContent}
            onSave={handleSave}
            editable={true}
            placeholder={t("Add a comment...")}
            surface="muted"
          />
        </div>
      </Group>
      {focused && (
        <ActionIcon
          variant="filled"
          radius="xl"
          size="sm"
          aria-label={t("Send comment")}
          onClick={handleSave}
          onMouseDown={(e) => e.preventDefault()}
          loading={isLoading}
          style={{ position: "absolute", right: 8, bottom: 30 }}
        >
          <IconArrowUp size={16} />
        </ActionIcon>
      )}
    </div>
  );
};

export default CommentListWithTabs;
