package tree_sitter_treesl_test

import (
	"testing"

	tree_sitter "github.com/smacker/go-tree-sitter"
	"github.com/tree-sitter/tree-sitter-treesl"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_treesl.Language())
	if language == nil {
		t.Errorf("Error loading Treesl grammar")
	}
}
